import DeflateCT from './DeflateCT';
import DeflateTreeDesc from './DeflateTreeDesc';
import Constant from './Constant';
import ZipState from './state/ZipState';
import Que from './state/Que';
import DeflateState from './state/DeflateState';
import TreeState from './state/TreeState';
import HeepState from './state/HeepState';
import Bits from './state/Bits';

/**
 * http://s.plantuml.com/synchro.js の関数群をTypeScriptへの移植。
 */
export default class OriginalZip {

    private state: ZipState = new ZipState();
    private que: Que = new Que();
    private deflateState: DeflateState = new DeflateState();
    private treeState: TreeState = new TreeState();
    private heepState: HeepState = new HeepState();
    private bits: Bits = new Bits();

    /* private readonly iables */
    private d_buf: Array<number> | null = null;
    private l_buf: Array<number> | null = null;
    private prev: Array<number> | null = null;
    private block_start: number = 0;
    private ins_h: number = 0;
    private hash_head: number = 0;
    private match_available: number = 0;
    private match_length: number = 0;
    private prev_length: number = 0;
    private eofile: boolean = false;
    private lookahead: number = 0;

    private max_chain_length: number = 0;
    private max_lazy_match: number = 0;
    private good_match: number = 0;
    private nice_match: number = 0;

    private compr_level: number = 0;
    private dyn_ltree: Array<DeflateCT> | null = null;
    private dyn_dtree: Array<DeflateCT> | null = null;
    private static_ltree: Array<DeflateCT> = new Array<DeflateCT>(0);
    private static_dtree: Array<DeflateCT> | null = null;
    private l_desc: DeflateTreeDesc = new DeflateTreeDesc();
    private d_desc: DeflateTreeDesc = new DeflateTreeDesc();
    private bl_desc: DeflateTreeDesc = new DeflateTreeDesc();
    private length_code: Array<number> = new Array<number>(0);
    private dist_code: Array<number> = new Array<number>(0);
    private base_length: Array<number> = new Array<number>(0);
    private base_dist: Array<number> = new Array<number>(0);
    private flag_buf: Array<number> = new Array<number>(0);
    private last_lit: number = 0;
    private last_dist: number = 0;
    private last_flags: number = 0;
    private flags: number = 0;
    private flag_bit: number = 0;

    public deflate = (str: string, level: number): string => {
        this.deflateState.initDeflateData(str);
        if (level == undefined) level = Constant.DEFAULT_LEVEL;
        this.deflate_start(level);

        const buff: Array<number> = new Array(1024);
        let out = "";
        let i;
        while ((i = this.deflate_internal(buff, 0, buff.length)) > 0) {
            for (let j = 0; j < i; j++) {
                out += String.fromCharCode(buff[j]);
            }
        }
        return out;
    }

    private deflate_start = (level: number) => {
        let i;

        if (!level) level = Constant.DEFAULT_LEVEL;
        else if (level < 1) level = 1;
        else if (level > 9) level = 9;

        this.compr_level = level;
        this.eofile = false;

        if (this.state.markd) return;

        this.state.initialize();
        this.que.initialize();
        this.deflateState.initialize();
        this.treeState.initialize();
        this.bits.initialize();

        this.d_buf = new Array(Constant.DIST_BUFSIZE);
        this.l_buf = new Array(Constant.INBUFSIZ + Constant.INBUF_EXTRA);
        this.prev = new Array(1 << Constant.BITS);
        this.dyn_ltree = new Array<DeflateCT>(Constant.HEAP_SIZE);
        for (i = 0; i < Constant.HEAP_SIZE; i++)
            this.dyn_ltree[i] = new DeflateCT();
        this.dyn_dtree = new Array(2 * Constant.D_CODES + 1);
        for (i = 0; i < 2 * Constant.D_CODES + 1; i++)
            this.dyn_dtree[i] = new DeflateCT();
        this.static_ltree = new Array(Constant.L_CODES + 2);
        for (i = 0; i < Constant.L_CODES + 2; i++)
            this.static_ltree[i] = new DeflateCT();
        this.static_dtree = new Array(Constant.D_CODES);
        for (i = 0; i < Constant.D_CODES; i++)
            this.static_dtree[i] = new DeflateCT();
        this.l_desc = new DeflateTreeDesc();
        this.d_desc = new DeflateTreeDesc();
        this.bl_desc = new DeflateTreeDesc();
        this.length_code = new Array(Constant.MAX_MATCH - Constant.MIN_MATCH + 1);
        this.dist_code = new Array(512);
        this.base_length = new Array(Constant.LENGTH_CODES);
        this.base_dist = new Array(Constant.D_CODES);
        this.flag_buf = new Array(Constant.LIT_BUFSIZE / 8);
    }

    private deflate_internal = (buff: Array<number>, off: number, buff_size: number): number => {
        let n;

        if (!this.state.initflag) {
            this.init_deflate();
            this.state.initflag = true;
            if (this.lookahead == 0) { // empty
                this.state.completed();
                return 0;
            }
        }

        n = this.que.qcopy(buff, off, buff_size);
        if (n == buff_size)
            return buff_size;


        if (this.state.complete) return n;

        if (this.compr_level <= 3) // optimized for speed
            this.deflate_fast();
        else
            this.deflate_better();

        if (this.lookahead == 0) {
            if (this.match_available != 0)
                this.ct_tally(0, this.deflateState.positionCodeOffset(-1));
            this.flush_block(1);
            this.state.completed();
        }
        return n + this.que.qcopy(buff, n + off, buff_size - n);
    }

    private init_deflate = () => {
        if (this.eofile) return;
        this.bits.initialize();
        this.ct_init();
        this.lm_init();

        this.que.queClear();

        if (this.compr_level <= 3) {
            this.prev_length = Constant.MIN_MATCH - 1;
            this.match_length = 0;
        }
        else {
            this.match_length = Constant.MIN_MATCH - 1;
            this.match_available = 0;
        }

        this.state.notCompleted();
    }

    private deflate_fast = () => {
        while (this.lookahead != 0 && this.que.nothingQueHead()) {
            let flush; // set if current block must be flushed

            this.INSERT_STRING();

            if (this.hash_head != Constant.NIL &&
                this.deflateState.strstart - this.hash_head <= Constant.MAX_DIST) {
                this.match_length = this.longest_match(this.hash_head);
                if (this.match_length > this.lookahead)
                    this.match_length = this.lookahead;
            }
            if (this.match_length >= Constant.MIN_MATCH) {

                flush = this.ct_tally(
                    this.deflateState.strstart - this.deflateState.match_start,
                    this.match_length - Constant.MIN_MATCH
                );
                this.lookahead -= this.match_length;

                if (this.match_length <= this.max_lazy_match) {
                    this.match_length--; // string at strstart already in hash table
                    do {
                        this.deflateState.moveNextStartPostion();
                        this.INSERT_STRING();
                    } while (--this.match_length != 0);
                    this.deflateState.moveNextStartPostion();
                } else {
                    this.deflateState.movePosition(this.match_length);
                    this.match_length = 0;
                    this.ins_h = this.deflateState.firstPositionCode();
                    this.ins_h = ((this.ins_h << Constant.H_SHIFT) ^ this.deflateState.positionCodeOffset(1)) & Constant.HASH_MASK;
                }
            } else {
                /* No match, output a literal byte */
                flush = this.ct_tally(0, this.deflateState.firstPositionCode());
                this.lookahead--;
                this.deflateState.moveNextStartPostion();
            }
            if (flush) {
                this.flush_block(0);
                this.block_start = this.deflateState.strstart;
            }

            while (this.lookahead < Constant.MIN_LOOKAHEAD && !this.eofile)
                this.fill_window();
        }
    }

    private INSERT_STRING = () => {
        if (!this.prev) throw new Error();  // 後付けチェック TODO 消したい

        this.ins_h = ((this.ins_h << Constant.H_SHIFT)
            ^ this.deflateState.positionCodeOffset(Constant.MIN_MATCH - 1)
        ) & Constant.HASH_MASK;
        this.hash_head = this.head1(this.ins_h);
        this.prev[this.deflateState.strstart & Constant.WMASK] = this.hash_head;
        this.head2(this.ins_h, this.deflateState.strstart);
    }

    private head1 = (i: number) => {
        if (!this.prev) throw new Error();  // 後付けチェック TODO 消したい
        return this.prev[Constant.WSIZE + i];
    }

    private head2 = (i: number, val: number) => {
        if (!this.prev) throw new Error();  // 後付けチェック TODO 消したい
        return this.prev[Constant.WSIZE + i] = val;
    }

    private longest_match = (cur_match: number) => {
        if (!this.prev) throw new Error();  // 後付けチェック TODO 消したい

        let chain_length: number = this.max_chain_length; // max hash chain length
        let scanp: number = this.deflateState.strstart; // current string
        let matchp: number;		// matched string
        let len: number;		// length of current match
        let best_len: number = this.prev_length;	// best match length so far

        let limit: number = (this.deflateState.strstart > Constant.MAX_DIST ? this.deflateState.strstart - Constant.MAX_DIST : Constant.NIL);

        const strendp: number = this.deflateState.strstart + Constant.MAX_MATCH;
        let scan_end1 = this.deflateState.window[scanp + best_len - 1];
        let scan_end = this.deflateState.window[scanp + best_len];

        if (this.prev_length >= this.good_match)
            chain_length >>= 2;

        do {
            matchp = cur_match;

            const defs: DeflateState = this.deflateState;

            if (defs.window[matchp + best_len] != scan_end ||
                defs.window[matchp + best_len - 1] != scan_end1 ||
                defs.window[matchp] != defs.window[scanp] ||
                defs.window[++matchp] != defs.window[scanp + 1]) {
                continue;
            }

            scanp += 2;
            matchp++;

            do { } while (defs.window[++scanp] == defs.window[++matchp] &&
                defs.window[++scanp] == defs.window[++matchp] &&
                defs.window[++scanp] == defs.window[++matchp] &&
                defs.window[++scanp] == defs.window[++matchp] &&
                defs.window[++scanp] == defs.window[++matchp] &&
                defs.window[++scanp] == defs.window[++matchp] &&
                defs.window[++scanp] == defs.window[++matchp] &&
                defs.window[++scanp] == defs.window[++matchp] &&
                scanp < strendp);

            len = Constant.MAX_MATCH - (strendp - scanp);
            scanp = strendp - Constant.MAX_MATCH;

            if (len > best_len) {
                defs.match_start = cur_match;
                best_len = len;
                if (Constant.FULL_SEARCH) {
                    if (len >= Constant.MAX_MATCH) break;
                } else {
                    if (len >= this.nice_match) break;
                }

                scan_end1 = defs.window[scanp + best_len - 1];
                scan_end = defs.window[scanp + best_len];
            }
        } while ((cur_match = this.prev[cur_match & Constant.WMASK]) > limit
            && --chain_length != 0);

        return best_len;
    }


    private deflate_better = () => {
        while (this.lookahead != 0 && this.que.nothingQueHead()) {
            this.INSERT_STRING();

            const prev_match = this.deflateState.match_start;

            this.prev_length = this.match_length;
            this.match_length = Constant.MIN_MATCH - 1;

            if (this.hash_head != Constant.NIL &&
                this.prev_length < this.max_lazy_match &&
                this.deflateState.strstart - this.hash_head <= Constant.MAX_DIST) {

                this.match_length = this.longest_match(this.hash_head);
                if (this.match_length > this.lookahead)
                    this.match_length = this.lookahead;

                if (this.match_length == Constant.MIN_MATCH &&
                    this.deflateState.strstart - prev_match > Constant.TOO_FAR) {
                    this.match_length--;
                }
            }
            if (this.prev_length >= Constant.MIN_MATCH &&
                this.match_length <= this.prev_length) {
                let flush; // set if current block must be flushed

                flush = this.ct_tally(this.deflateState.strstart - 1 - prev_match,
                    this.prev_length - Constant.MIN_MATCH);

                this.lookahead -= this.prev_length - 1;
                this.prev_length -= 2;
                do {
                    this.deflateState.moveNextStartPostion();
                    this.INSERT_STRING();
                } while (--this.prev_length != 0);
                this.match_available = 0;
                this.match_length = Constant.MIN_MATCH - 1;
                this.deflateState.moveNextStartPostion();
                if (flush) {
                    this.flush_block(0);
                    this.block_start = this.deflateState.strstart;
                }
            } else if (this.match_available != 0) {
                if (this.ct_tally(0, this.deflateState.positionCodeOffset(-1))) {
                    this.flush_block(0);
                    this.block_start = this.deflateState.strstart;
                }
                this.deflateState.moveNextStartPostion();
                this.lookahead--;
            } else {
                this.match_available = 1;
                this.deflateState.moveNextStartPostion();
                this.lookahead--;
            }

            while (this.lookahead < Constant.MIN_LOOKAHEAD && !this.eofile)
                this.fill_window();
        }
    }

    /**
     * ct_tally.
     * @param dist distance of matched string.
     * @param lc  match length-MIN_MATCH or unmatched char (if dist==0).
     */
    private ct_tally = (dist: number, lc: number) => {
        if (!this.l_buf) throw new Error();  // 後付けチェック TODO 消したい
        if (!this.dyn_ltree) throw new Error();  // 後付けチェック TODO 消したい
        if (!this.dyn_dtree) throw new Error();  // 後付けチェック TODO 消したい
        if (!this.d_buf) throw new Error();  // 後付けチェック TODO 消したい

        this.l_buf[this.last_lit++] = lc;


        if (dist == 0) {
            this.dyn_ltree[lc].fc++;
        } else {
            dist--;		    // dist = match distance - 1

            this.dyn_ltree[this.length_code[lc] + Constant.LITERALS + 1].fc++;
            this.dyn_dtree[this.D_CODE(dist)].fc++;

            this.d_buf[this.last_dist++] = dist;
            this.flags |= this.flag_bit;
        }
        this.flag_bit <<= 1;

        if ((this.last_lit & 7) == 0) {
            this.flag_buf[this.last_flags++] = this.flags;
            this.flags = 0;
            this.flag_bit = 1;
        }
        if (this.compr_level > 2 && (this.last_lit & 0xfff) == 0) {
            let out_length = this.last_lit * 8;
            const in_length = this.deflateState.strstart - this.block_start;

            for (let dcode = 0; dcode < Constant.D_CODES; dcode++) {
                out_length += this.dyn_dtree[dcode].fc * (5 + Constant.EXTRA_D_BITS[dcode]);
            }
            out_length >>= 3;
            if (this.last_dist < (this.last_lit / 2) && out_length < (in_length / 2)) return true;
        }
        return (this.last_lit == Constant.LIT_BUFSIZE - 1 ||
            this.last_dist == Constant.DIST_BUFSIZE);
    }

    private D_CODE = (dist: number) => {
        return (dist < 256 ? this.dist_code[dist]
            : this.dist_code[256 + (dist >> 7)]) & 0xff;
    }


    private ct_init = () => {
        if (!this.static_dtree) throw new Error();  // 後付けチェック TODO 消したい

        let code: number;	// code value
        let dist: number;	// distance index

        if (this.static_dtree[0].dl != 0) return; // ct_init already called

        const lDesc: DeflateTreeDesc = this.l_desc;
        lDesc.dyn_tree = this.dyn_ltree;
        lDesc.static_tree = this.static_ltree;
        lDesc.extra_bits = Constant.EXTRA_L_BITS;
        lDesc.extra_base = Constant.LITERALS + 1;
        lDesc.elems = Constant.L_CODES;
        lDesc.max_length = Constant.MAX_BITS;
        lDesc.max_code = 0;

        this.d_desc.dyn_tree = this.dyn_dtree;
        this.d_desc.static_tree = this.static_dtree;
        this.d_desc.extra_bits = Constant.EXTRA_D_BITS;
        this.d_desc.extra_base = 0;
        this.d_desc.elems = Constant.D_CODES;
        this.d_desc.max_length = Constant.MAX_BITS;
        this.d_desc.max_code = 0;

        this.bl_desc.dyn_tree = this.treeState.bl_tree;
        this.bl_desc.static_tree = null;
        this.bl_desc.extra_bits = Constant.EXTRA_BL_BITS;
        this.bl_desc.extra_base = 0;
        this.bl_desc.elems = Constant.BL_CODES;
        this.bl_desc.max_length = Constant.MAX_BL_BITS;
        this.bl_desc.max_code = 0;

        let length = 0;
        for (code = 0; code < Constant.LENGTH_CODES - 1; code++) {
            this.base_length[code] = length;
            for (let n = 0; n < (1 << Constant.EXTRA_L_BITS[code]); n++)
                this.length_code[length++] = code;
        }
        this.length_code[length - 1] = code;

        dist = 0;
        for (code = 0; code < 16; code++) {
            this.base_dist[code] = dist;
            for (let n = 0; n < (1 << Constant.EXTRA_D_BITS[code]); n++) {
                this.dist_code[dist++] = code;
            }
        }
        dist >>= 7; // from now on, all distances are divided by 128
        for (; code < Constant.D_CODES; code++) {
            this.base_dist[code] = dist << 7;
            for (let n = 0; n < (1 << (Constant.EXTRA_D_BITS[code] - 7)); n++)
                this.dist_code[256 + dist++] = code;
        }

        for (let n = 0; n < this.static_ltree.length; n++) {
            let dlValue = 8;
            if (n > 143) {
                if (n <= 255) dlValue = 9
                else if (n <= 279) dlValue = 7;
            }
            this.static_ltree[n].dl = dlValue;
        }

        this.heepState.initialSetBlCount();

        this.heepState.gen_codes(this.static_ltree, Constant.L_CODES + 1);

        /* The static distance tree is trivial: */
        for (let i = 0; i < Constant.D_CODES; i++) {
            this.static_dtree[i].dl = 5;
            this.static_dtree[i].fc = this.heepState.bi_reverse(i, 5);
        }

        // Initialize the first block of the first file:
        this.init_block();

    }

    /**
     * @number true if this is the last block for a file
     */
    private flush_block = (eof: number) => {
        if (!this.static_dtree) throw new Error();  // 後付けチェック TODO 消したい
        if (!this.dyn_dtree) throw new Error();  // 後付けチェック TODO 消したい
        if (!this.dyn_ltree) throw new Error();  // 後付けチェック TODO 消したい

        let stored_len = this.deflateState.strstart - this.block_start;	// length of input block
        this.flag_buf[this.last_flags] = this.flags; // Save the flags for the last 8 items


        this.heepState.build_tree(this.l_desc);
        this.heepState.build_tree(this.d_desc);

        const max_blindex = this.build_bl_tree(this.treeState); // index of last bit length code of non zero freq


        let opt_lenb = (this.heepState.opt_len + 3 + 7) >> 3;
        const static_lenb = (this.heepState.static_len + 3 + 7) >> 3; // opt_len and static_len in bytes

        if (static_lenb <= opt_lenb)
            opt_lenb = static_lenb;
        if (stored_len + 4 <= opt_lenb // 4: two words for the lengths
            && this.block_start >= 0) {
            let i;

            this.bits.send_bits((Constant.STORED_BLOCK << 1) + eof, 3, this.que);  /* send block type */
            this.bits.bi_windup(this.que);		 /* align on byte boundary */
            this.que.put_short(stored_len);
            this.que.put_short(~stored_len);

            for (i = 0; i < stored_len; i++)
                this.que.put_byte(this.deflateState.window[this.block_start + i]);

        } else if (static_lenb == opt_lenb) {
            this.bits.send_bits((Constant.STATIC_TREES << 1) + eof, 3, this.que);
            this.compress_block(this.static_ltree, this.static_dtree);
        } else {
            this.bits.send_bits((Constant.DYN_TREES << 1) + eof, 3, this.que);
            this.send_all_trees(this.l_desc.max_code + 1,
                this.d_desc.max_code + 1,
                max_blindex + 1);
            this.compress_block(this.dyn_ltree, this.dyn_dtree);
        }

        this.init_block();

        if (eof != 0) this.bits.bi_windup(this.que);
    }

    /**
     * compress_block.
     * @param ltree literal tree. 
     * @param dtree distance tree.
     */
    private compress_block = (ltree: Array<DeflateCT>, dtree: Array<DeflateCT>) => {
        if (!this.l_buf) throw new Error();  // 後付けチェック TODO 消したい
        if (!this.d_buf) throw new Error();  // 後付けチェック TODO 消したい

        let dist: number;		// distance of matched string
        let lc: number;		// match length or unmatched char (if dist == 0)
        let lx = 0;		// running index in l_buf
        let dx = 0;		// running index in d_buf
        let fx = 0;		// running index in flag_buf
        let flag = 0;	// current flags
        let code: number;		// the code to send
        let extra: number;		// number of extra bits to send

        if (this.last_lit != 0) do {
            if ((lx & 7) == 0)
                flag = this.flag_buf[fx++];


            lc = this.l_buf[lx++] & 0xff;
            if ((flag & 1) == 0) {
                this.SEND_CODE(lc, ltree); /* send a literal byte */
            } else {
                code = this.length_code[lc];
                this.SEND_CODE(code + Constant.LITERALS + 1, ltree); // send the length code
                extra = Constant.EXTRA_L_BITS[code];
                if (extra != 0) {
                    lc -= this.base_length[code];


                    this.bits.send_bits(lc, extra, this.que); // send the extra length bits
                }
                dist = this.d_buf[dx++];
                code = this.D_CODE(dist);
                this.SEND_CODE(code, dtree);	  // send the distance code
                extra = Constant.EXTRA_D_BITS[code];
                if (extra != 0) {
                    dist -= this.base_dist[code];


                    this.bits.send_bits(dist, extra, this.que);   // send the extra distance bits
                }
            } // literal or match pair ?
            flag >>= 1;
        } while (lx < this.last_lit);

        this.SEND_CODE(Constant.END_BLOCK, ltree);
    }

    private SEND_CODE = (c: number, tree: Array<DeflateCT>) => {
        this.bits.send_bits(tree[c].fc, tree[c].dl, this.que);
    }

    private init_block = () => {
        if (!this.dyn_ltree) throw new Error();  // 後付けチェック TODO 消したい
        if (!this.dyn_dtree) throw new Error();  // 後付けチェック TODO 消したい

        // Initialize the trees.
        for (let n = 0; n < Constant.L_CODES; n++) this.dyn_ltree[n].fc = 0;
        for (let n = 0; n < Constant.D_CODES; n++) this.dyn_dtree[n].fc = 0;
        this.treeState.claerAllFc();

        this.dyn_ltree[Constant.END_BLOCK].fc = 1;
        this.heepState.clearLength();
        this.last_lit = 0;
        this.last_dist = 0;
        this.last_flags = 0;
        this.flags = 0;
        this.flag_bit = 1;
    }

    private send_all_trees = (lcodes: number, dcodes: number, blcodes: number) => { // number of codes for each tree
        if (!this.dyn_ltree) throw new Error();  // 後付けチェック TODO 消したい
        if (!this.dyn_dtree) throw new Error();  // 後付けチェック TODO 消したい

        this.bits.send_bits(lcodes - 257, 5, this.que); // not +255 as stated in appnote.txt
        this.bits.send_bits(dcodes - 1, 5, this.que);
        this.bits.send_bits(blcodes - 4, 4, this.que); // not -3 as stated in appnote.txt
        for (let rank = 0; rank < blcodes; rank++) {
            this.bits.send_bits(this.treeState.getItemWithOrder(rank).dl, 3, this.que);
        }
        this.send_tree(this.dyn_ltree, lcodes - 1);
        this.send_tree(this.dyn_dtree, dcodes - 1);
    }

    /**
     * send_tree.
     * @param tree the tree to be scanned.
     * @param max_code and its largest code of non zero frequency.
     */
    private send_tree = (tree: Array<DeflateCT>, max_code: number) => {

        let nextlen = tree[0].dl;	// length of next code

        /* tree[max_code+1].dl = -1; */  /* guard already set */
        let max_count = 7;		// max repeat count
        let min_count = 4;		// min repeat count
        if (nextlen == 0) {
            max_count = 138;
            min_count = 3;
        }

        const bl_tree = this.treeState.bl_tree;

        let prevlen = -1;		// last emitted length
        let count = 0;		// repeat count of the current code
        for (let n = 0; n <= max_code; n++) {
            const curlen = nextlen;// length of current code
            nextlen = tree[n + 1].dl;
            if (++count < max_count && curlen == nextlen) {
                continue;
            } else if (count < min_count) {
                do { this.SEND_CODE(curlen, bl_tree); } while (--count != 0);
            } else if (curlen != 0) {
                if (curlen != prevlen) {
                    this.SEND_CODE(curlen, bl_tree);
                    count--;
                }
                // Assert(count >= 3 && count <= 6, " 3_6?");
                this.SEND_CODE(Constant.REP_3_6, bl_tree);
                this.bits.send_bits(count - 3, 2, this.que);
            } else if (count <= 10) {
                this.SEND_CODE(Constant.REPZ_3_10, bl_tree);
                this.bits.send_bits(count - 3, 3, this.que);
            } else {
                this.SEND_CODE(Constant.REPZ_11_138, bl_tree);
                this.bits.send_bits(count - 11, 7, this.que);
            }
            count = 0;
            prevlen = curlen;
            if (nextlen == 0) {
                max_count = 138;
                min_count = 3;
            } else if (curlen == nextlen) {
                max_count = 6;
                min_count = 3;
            } else {
                max_count = 7;
                min_count = 4;
            }
        }
    }

    private lm_init = () => {
        if (!this.prev) throw new Error();  // 後付けチェック TODO 消したい

        /* Initialize the hash table. */
        for (let j = 0; j < Constant.HASH_SIZE; j++)
            this.prev[Constant.WSIZE + j] = 0;

        const tableItem = Constant.CONFIGURATION_TABLE[this.compr_level];
        this.max_lazy_match = tableItem.max_lazy;
        this.good_match = tableItem.good_length;
        if (!Constant.FULL_SEARCH) this.nice_match = tableItem.nice_length;
        this.max_chain_length = tableItem.max_chain;

        this.deflateState.clearPosition();
        this.block_start = 0;

        this.lookahead = this.deflateState.read_buff(0, 2 * Constant.WSIZE);
        if (this.lookahead <= 0) {
            this.eofile = true;
            this.lookahead = 0;
            return;
        }
        this.eofile = false;

        while (this.lookahead < Constant.MIN_LOOKAHEAD && !this.eofile)
            this.fill_window();

        this.ins_h = 0;
        for (let j = 0; j < Constant.MIN_MATCH - 1; j++) {
            this.ins_h = ((this.ins_h << Constant.H_SHIFT) ^ (this.deflateState.window[j] & 0xff)) & Constant.HASH_MASK;
        }
    }

    private fill_window = () => {
        if (!this.prev) throw new Error();  // 後付けチェック TODO 消したい

        let more = Constant.WINDOW_SIZE - this.lookahead - this.deflateState.strstart;

        if (more == -1) {
            more--;
        } else if (this.deflateState.strstart >= Constant.WSIZE + Constant.MAX_DIST) {
            for (let n = 0; n < Constant.WSIZE; n++)
                this.deflateState.window[n] = this.deflateState.window[n + Constant.WSIZE];

            this.deflateState.match_start -= Constant.WSIZE;
            this.deflateState.movePosition(-Constant.WSIZE); /* we now have strstart >= MAX_DIST: */
            this.block_start -= Constant.WSIZE;

            for (let n = 0; n < Constant.HASH_SIZE; n++) {
                const m = this.head1(n);
                this.head2(n, m >= Constant.WSIZE ? m - Constant.WSIZE : Constant.NIL);
            }
            for (let n = 0; n < Constant.WSIZE; n++) {
                const m = this.prev[n];
                this.prev[n] = (m >= Constant.WSIZE ? m - Constant.WSIZE : Constant.NIL);
            }
            more += Constant.WSIZE;
        }
        if (!this.eofile) {
            const n = this.deflateState.read_buff(this.deflateState.strstart + this.lookahead, more);
            if (n <= 0)
                this.eofile = true;
            else
                this.lookahead += n;
        }
    }

    private build_bl_tree(treeState: TreeState): number {
        if (!this.dyn_ltree) throw new Error();  // 後付けチェック TODO 消したい
        if (!this.dyn_dtree) throw new Error();  // 後付けチェック TODO 消したい

        treeState.scan_tree(this.dyn_ltree, this.l_desc.max_code);
        treeState.scan_tree(this.dyn_dtree, this.d_desc.max_code);

        this.heepState.build_tree(this.bl_desc);
        let max_blindex: number;
        for (max_blindex = Constant.BL_CODES - 1; max_blindex >= 3; max_blindex--) {
            if (treeState.getItemWithOrder(max_blindex).dl != 0) break;
        }
        this.heepState.addOptLength(3 * (max_blindex + 1) + 5 + 5 + 4);
        return max_blindex;
    }

}