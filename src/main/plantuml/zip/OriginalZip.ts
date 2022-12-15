import DeflateCT from './DeflateCT';
import DeflateBuffer from './DeflateBuffer';
import DeflateTreeDesc from './DeflateTreeDesc';
import Constant from './Constant';

/**
 * http://s.plantuml.com/synchro.js の関数群をTypeScriptへの移植。
 */
export default class OriginalZip {

    /* private readonly iables */
    private free_queue: DeflateBuffer | null;
    private qhead: DeflateBuffer | null;
    private qtail: DeflateBuffer;
    private initflag: boolean;
    private outbuf: Array<number>;
    private outcnt: number;
    private outoff: number;
    private complete: boolean;
    private window: Array<number>;
    private d_buf: Array<number>;
    private l_buf: Array<number>;
    private prev: Array<number>;
    private bi_buf: number;
    private bi_valid: number;
    private block_start: number;
    private ins_h: number;
    private hash_head: number;
    private match_available: number;
    private match_length: number;
    private prev_length: number;
    private strstart: number;
    private match_start: number;
    private eofile: boolean;
    private lookahead: number;

    private max_chain_length: number;
    private max_lazy_match: number;
    private good_match: number;
    private nice_match: number;

    private compr_level: number;
    private dyn_ltree: Array<DeflateCT>;
    private dyn_dtree: Array<DeflateCT>;
    private static_ltree: Array<DeflateCT>;
    private static_dtree: Array<DeflateCT>;
    private bl_tree: Array<DeflateCT>;
    private l_desc: DeflateTreeDesc;
    private d_desc: DeflateTreeDesc;
    private bl_desc: DeflateTreeDesc;
    private bl_count: Array<number>;
    private heap: Array<number>;
    private heap_len: number;
    private heap_max: number;
    private depth: Array<number>;
    private length_code: Array<number>;
    private dist_code: Array<number>;
    private base_length: Array<number>;
    private base_dist: Array<number>;
    private flag_buf: Array<number>;
    private last_lit: number;
    private last_dist: number;
    private last_flags: number;
    private flags: number;
    private flag_bit: number;
    private opt_len: number;
    private static_len: number;
    private deflate_data: string;
    private deflate_pos: number;

    public deflate = (str: string, level: number): string => {
        this.deflate_data = str;
        this.deflate_pos = 0;
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
        this.initflag = false;
        this.eofile = false;

        if (this.outbuf != null) return;

        this.free_queue = this.qhead = null;
        this.outbuf = new Array(Constant.OUTBUFSIZ);
        this.window = new Array(Constant.WINDOW_SIZE);
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
        this.bl_tree = new Array(2 * Constant.BL_CODES + 1);
        for (i = 0; i < 2 * Constant.BL_CODES + 1; i++)
            this.bl_tree[i] = new DeflateCT();
        this.l_desc = new DeflateTreeDesc();
        this.d_desc = new DeflateTreeDesc();
        this.bl_desc = new DeflateTreeDesc();
        this.bl_count = new Array(Constant.MAX_BITS + 1);
        this.heap = new Array(2 * Constant.L_CODES + 1);
        this.depth = new Array(2 * Constant.L_CODES + 1);
        this.length_code = new Array(Constant.MAX_MATCH - Constant.MIN_MATCH + 1);
        this.dist_code = new Array(512);
        this.base_length = new Array(Constant.LENGTH_CODES);
        this.base_dist = new Array(Constant.D_CODES);
        this.flag_buf = new Array(Constant.LIT_BUFSIZE / 8);
    }

    private deflate_internal = (buff: Array<number>, off: number, buff_size: number): number => {
        let n;


        if (!this.initflag) {
            this.init_deflate();
            this.initflag = true;
            if (this.lookahead == 0) { // empty
                this.complete = true;
                return 0;
            }
        }

        if ((n = this.qcopy(buff, off, buff_size)) == buff_size)
            return buff_size;


        if (this.complete) return n;

        if (this.compr_level <= 3) // optimized for speed
            this.deflate_fast();
        else
            this.deflate_better();

        if (this.lookahead == 0) {
            if (this.match_available != 0)
                this.ct_tally(0, this.window[this.strstart - 1] & 0xff);
            this.flush_block(1);
            this.complete = true;
        }
        return n + this.qcopy(buff, n + off, buff_size - n);
    }

    private init_deflate = () => {
        if (this.eofile) return;
        this.bi_buf = 0;
        this.bi_valid = 0;
        this.ct_init();
        this.lm_init();

        this.qhead = null;
        this.outcnt = 0;
        this.outoff = 0;

        if (this.compr_level <= 3) {
            this.prev_length = Constant.MIN_MATCH - 1;
            this.match_length = 0;
        }
        else {
            this.match_length = Constant.MIN_MATCH - 1;
            this.match_available = 0;
        }

        this.complete = false;
    }

    private qcopy = (buff: Array<number>, off: number, buff_size: number): number => {
        let n: number;
        let i: number;
        let j: number;

        n = 0;
        while (this.qhead != null && n < buff_size) {
            i = buff_size - n;
            if (i > this.qhead.len)
                i = this.qhead.len;
            //      System.arraycopy(qhead.ptr, qhead.off, buff, off + n, i);
            for (j = 0; j < i; j++)
                buff[off + n + j] = this.qhead.ptr[this.qhead.off + j];

            this.qhead.off += i;
            this.qhead.len -= i;
            n += i;
            if (this.qhead.len == 0) {
                var p;
                p = this.qhead;
                this.qhead = this.qhead.next;
                this.reuse_queue(p);
            }
        }

        if (n == buff_size) return n;

        if (this.outoff < this.outcnt) {
            i = buff_size - n;
            if (i > this.outcnt - this.outoff)
                i = this.outcnt - this.outoff;


            // System.arraycopy(outbuf, outoff, buff, off + n, i);
            for (j = 0; j < i; j++)
                buff[off + n + j] = this.outbuf[this.outoff + j];
            this.outoff += i;
            n += i;
            if (this.outcnt == this.outoff) {
                this.outcnt = this.outoff = 0;
            }
        }
        return n;
    }

    private deflate_fast = () => {
        while (this.lookahead != 0 && this.qhead == null) {
            let flush; // set if current block must be flushed

            this.INSERT_STRING();

            if (this.hash_head != Constant.NIL &&
                this.strstart - this.hash_head <= Constant.MAX_DIST) {
                this.match_length = this.longest_match(this.hash_head);
                if (this.match_length > this.lookahead)
                    this.match_length = this.lookahead;
            }
            if (this.match_length >= Constant.MIN_MATCH) {

                flush = this.ct_tally(
                    this.strstart - this.match_start,
                    this.match_length - Constant.MIN_MATCH
                );
                this.lookahead -= this.match_length;

                if (this.match_length <= this.max_lazy_match) {
                    this.match_length--; // string at strstart already in hash table
                    do {
                        this.strstart++;
                        this.INSERT_STRING();
                    } while (--this.match_length != 0);
                    this.strstart++;
                } else {
                    this.strstart += this.match_length;
                    this.match_length = 0;
                    this.ins_h = this.window[this.strstart] & 0xff;
                    this.ins_h = ((this.ins_h << Constant.H_SHIFT) ^ (this.window[this.strstart + 1] & 0xff)) & Constant.HASH_MASK;
                }
            } else {
                /* No match, output a literal byte */
                flush = this.ct_tally(0, this.window[this.strstart] & 0xff);
                this.lookahead--;
                this.strstart++;
            }
            if (flush) {
                this.flush_block(0);
                this.block_start = this.strstart;
            }

            while (this.lookahead < Constant.MIN_LOOKAHEAD && !this.eofile)
                this.fill_window();
        }
    }

    private INSERT_STRING = () => {
        this.ins_h = ((this.ins_h << Constant.H_SHIFT)
            ^ (this.window[this.strstart + Constant.MIN_MATCH - 1] & 0xff))
            & Constant.HASH_MASK;
        this.hash_head = this.head1(this.ins_h);
        this.prev[this.strstart & Constant.WMASK] = this.hash_head;
        this.head2(this.ins_h, this.strstart);
    }
    private head1 = (i: number) => {
        return this.prev[Constant.WSIZE + i];
    }
    private head2 = (i: number, val: number) => {
        return this.prev[Constant.WSIZE + i] = val;
    }

    private longest_match = (cur_match: number) => {
        let chain_length: number = this.max_chain_length; // max hash chain length
        let scanp: number = this.strstart; // current string
        let matchp: number;		// matched string
        let len: number;		// length of current match
        let best_len: number = this.prev_length;	// best match length so far

        let limit: number = (this.strstart > Constant.MAX_DIST ? this.strstart - Constant.MAX_DIST : Constant.NIL);

        const strendp: number = this.strstart + Constant.MAX_MATCH;
        let scan_end1 = this.window[scanp + best_len - 1];
        let scan_end = this.window[scanp + best_len];

        if (this.prev_length >= this.good_match)
            chain_length >>= 2;

        do {
            matchp = cur_match;

            if (this.window[matchp + best_len] != scan_end ||
                this.window[matchp + best_len - 1] != scan_end1 ||
                this.window[matchp] != this.window[scanp] ||
                this.window[++matchp] != this.window[scanp + 1]) {
                continue;
            }

            scanp += 2;
            matchp++;

            do { } while (this.window[++scanp] == this.window[++matchp] &&
                this.window[++scanp] == this.window[++matchp] &&
                this.window[++scanp] == this.window[++matchp] &&
                this.window[++scanp] == this.window[++matchp] &&
                this.window[++scanp] == this.window[++matchp] &&
                this.window[++scanp] == this.window[++matchp] &&
                this.window[++scanp] == this.window[++matchp] &&
                this.window[++scanp] == this.window[++matchp] &&
                scanp < strendp);

            len = Constant.MAX_MATCH - (strendp - scanp);
            scanp = strendp - Constant.MAX_MATCH;

            if (len > best_len) {
                this.match_start = cur_match;
                best_len = len;
                if (Constant.FULL_SEARCH) {
                    if (len >= Constant.MAX_MATCH) break;
                } else {
                    if (len >= this.nice_match) break;
                }

                scan_end1 = this.window[scanp + best_len - 1];
                scan_end = this.window[scanp + best_len];
            }
        } while ((cur_match = this.prev[cur_match & Constant.WMASK]) > limit
            && --chain_length != 0);

        return best_len;
    }


    private deflate_better = () => {
        while (this.lookahead != 0 && this.qhead == null) {
            this.INSERT_STRING();

            const prev_match = this.match_start;

            this.prev_length = this.match_length;
            this.match_length = Constant.MIN_MATCH - 1;

            if (this.hash_head != Constant.NIL &&
                this.prev_length < this.max_lazy_match &&
                this.strstart - this.hash_head <= Constant.MAX_DIST) {

                this.match_length = this.longest_match(this.hash_head);
                if (this.match_length > this.lookahead)
                    this.match_length = this.lookahead;

                if (this.match_length == Constant.MIN_MATCH &&
                    this.strstart - this.match_start > Constant.TOO_FAR) {
                    this.match_length--;
                }
            }
            if (this.prev_length >= Constant.MIN_MATCH &&
                this.match_length <= this.prev_length) {
                let flush; // set if current block must be flushed

                flush = this.ct_tally(this.strstart - 1 - prev_match,
                    this.prev_length - Constant.MIN_MATCH);

                this.lookahead -= this.prev_length - 1;
                this.prev_length -= 2;
                do {
                    this.strstart++;
                    this.INSERT_STRING();
                } while (--this.prev_length != 0);
                this.match_available = 0;
                this.match_length = Constant.MIN_MATCH - 1;
                this.strstart++;
                if (flush) {
                    this.flush_block(0);
                    this.block_start = this.strstart;
                }
            } else if (this.match_available != 0) {
                if (this.ct_tally(0, this.window[this.strstart - 1] & 0xff)) {
                    this.flush_block(0);
                    this.block_start = this.strstart;
                }
                this.strstart++;
                this.lookahead--;
            } else {
                this.match_available = 1;
                this.strstart++;
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
            const in_length = this.strstart - this.block_start;

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

        this.bl_desc.dyn_tree = this.bl_tree;
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

        for (let bits = 0; bits <= Constant.MAX_BITS; bits++)
            this.bl_count[bits] = 0;
        let n = 0;

        for (n = 0; n <= 287; n++) {
            let dlValue = 8;
            if (n <= 143) dlValue = 8
            else if (n <= 255) dlValue = 9
            else if (n <= 279) dlValue = 7;
        
            this.static_ltree[n].dl = dlValue;
            this.bl_count[dlValue]++;
        }
        // // 上は下のルーチンを書き換えたもの TODO 安定したら下を消す     
        // while (n <= 143) { this.static_ltree[n++].dl = 8; this.bl_count[8]++; }
        // while (n <= 255) { this.static_ltree[n++].dl = 9; this.bl_count[9]++; }
        // while (n <= 279) { this.static_ltree[n++].dl = 7; this.bl_count[7]++; }
        // while (n <= 287) { this.static_ltree[n++].dl = 8; this.bl_count[8]++; }

        this.gen_codes(this.static_ltree, Constant.L_CODES + 1);

        /* The static distance tree is trivial: */
        for (n = 0; n < Constant.D_CODES; n++) {
            this.static_dtree[n].dl = 5;
            this.static_dtree[n].fc = this.bi_reverse(n, 5);
        }

        // Initialize the first block of the first file:
        this.init_block();

    }

    /**
     * gen_codes.
     * @param tree the tree to decorate.
     * @param max_code largest code with non zero frequency.
     */
    private gen_codes = (tree: Array<DeflateCT>, max_code: number) => {
        const next_code = new Array(Constant.MAX_BITS + 1); // next code value for each bit length
        let code = 0;		// running code value

        for (let bits = 1; bits <= Constant.MAX_BITS; bits++) {
            code = ((code + this.bl_count[bits - 1]) << 1);
            next_code[bits] = code;
        }

        for (let n = 0; n <= max_code; n++) {
            let len = tree[n].dl;
            if (len == 0)
                continue;
            // Now reverse the bits
            tree[n].fc = this.bi_reverse(next_code[len]++, len);
        }
    }

    /**
     * bi_reverse.
     * @param code the value to invert.
     * @param len its bit length.
     */
    private bi_reverse = (code: number, len: number) => {
        let res = 0;
        do {
            res |= code & 1;
            code >>= 1;
            res <<= 1;
        } while (--len > 0);
        return res >> 1;
    }

    /**
     * @number true if this is the last block for a file
     */
    private flush_block = (eof: number) => {


        let stored_len = this.strstart - this.block_start;	// length of input block
        this.flag_buf[this.last_flags] = this.flags; // Save the flags for the last 8 items


        this.build_tree(this.l_desc);
        this.build_tree(this.d_desc);

        const max_blindex = this.build_bl_tree(); // index of last bit length code of non zero freq


        let opt_lenb = (this.opt_len + 3 + 7) >> 3;
        const static_lenb = (this.static_len + 3 + 7) >> 3; // opt_len and static_len in bytes

        if (static_lenb <= opt_lenb)
            opt_lenb = static_lenb;
        if (stored_len + 4 <= opt_lenb // 4: two words for the lengths
            && this.block_start >= 0) {
            let i;

            this.send_bits((Constant.STORED_BLOCK << 1) + eof, 3);  /* send block type */
            this.bi_windup();		 /* align on byte boundary */
            this.put_short(stored_len);
            this.put_short(~stored_len);

            for (i = 0; i < stored_len; i++)
                this.put_byte(this.window[this.block_start + i]);

        } else if (static_lenb == opt_lenb) {
            this.send_bits((Constant.STATIC_TREES << 1) + eof, 3);
            this.compress_block(this.static_ltree, this.static_dtree);
        } else {


            this.send_bits((Constant.DYN_TREES << 1) + eof, 3);
            this.send_all_trees(this.l_desc.max_code + 1,
                this.d_desc.max_code + 1,
                max_blindex + 1);
            this.compress_block(this.dyn_ltree, this.dyn_dtree);
        }

        this.init_block();

        if (eof != 0) this.bi_windup();
    }

    /**
     * send_bits.
     * @param value value to send. 
     * @param length  number of bits.
     */
    private send_bits = (value: number, length: number) => {


        const BUF_SIZE = 16; // bit size of bi_buf
        if (this.bi_valid > BUF_SIZE - length) {
            this.bi_buf |= (value << this.bi_valid);
            this.put_short(this.bi_buf);
            this.bi_buf = (value >> (BUF_SIZE - this.bi_valid));
            this.bi_valid += length - BUF_SIZE;
        } else {
            this.bi_buf |= value << this.bi_valid;
            this.bi_valid += length;
        }
    }

    private bi_windup = () => {
        if (this.bi_valid > 8) {
            this.put_short(this.bi_buf);
        } else if (this.bi_valid > 0) {
            this.put_byte(this.bi_buf);
        }
        this.bi_buf = 0;
        this.bi_valid = 0;
    }

    private put_short = (w: number) => {


        w &= 0xffff;
        if (this.outoff + this.outcnt < Constant.OUTBUFSIZ - 2) {
            this.outbuf[this.outoff + this.outcnt++] = (w & 0xff);
            this.outbuf[this.outoff + this.outcnt++] = (w >>> 8);
        } else {
            this.put_byte(w & 0xff);
            this.put_byte(w >>> 8);
        }
    }

    private put_byte = (c: number) => {
        this.outbuf[this.outoff + this.outcnt++] = c;
        if (this.outoff + this.outcnt == Constant.OUTBUFSIZ)
            this.qoutbuf();
    }

    /**
     * compress_block.
     * @param ltree literal tree. 
     * @param dtree distance tree.
     */
    private compress_block = (ltree: Array<DeflateCT>, dtree: Array<DeflateCT>) => {

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


                    this.send_bits(lc, extra); // send the extra length bits
                }
                dist = this.d_buf[dx++];
                code = this.D_CODE(dist);
                this.SEND_CODE(code, dtree);	  // send the distance code
                extra = Constant.EXTRA_D_BITS[code];
                if (extra != 0) {
                    dist -= this.base_dist[code];


                    this.send_bits(dist, extra);   // send the extra distance bits
                }
            } // literal or match pair ?
            flag >>= 1;
        } while (lx < this.last_lit);

        this.SEND_CODE(Constant.END_BLOCK, ltree);
    }

    private SEND_CODE = (c: number, tree: Array<DeflateCT>) => {
        this.send_bits(tree[c].fc, tree[c].dl);
    }

    private init_block = () => {
        // Initialize the trees.
        for (let n = 0; n < Constant.L_CODES; n++) this.dyn_ltree[n].fc = 0;
        for (let n = 0; n < Constant.D_CODES; n++) this.dyn_dtree[n].fc = 0;
        for (let n = 0; n < Constant.BL_CODES; n++) this.bl_tree[n].fc = 0;

        this.dyn_ltree[Constant.END_BLOCK].fc = 1;
        this.opt_len = this.static_len = 0;
        this.last_lit = 0;
        this.last_dist = 0;
        this.last_flags = 0;
        this.flags = 0;
        this.flag_bit = 1;
    }

    private send_all_trees = (lcodes: number, dcodes: number, blcodes: number) => { // number of codes for each tree


        this.send_bits(lcodes - 257, 5); // not +255 as stated in appnote.txt
        this.send_bits(dcodes - 1, 5);
        this.send_bits(blcodes - 4, 4); // not -3 as stated in appnote.txt
        for (let rank = 0; rank < blcodes; rank++) {
            this.send_bits(this.bl_tree[Constant.BL_ORDER[rank]].dl, 3);
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

        let prevlen = -1;		// last emitted length
        let count = 0;		// repeat count of the current code
        for (let n = 0; n <= max_code; n++) {
            const curlen = nextlen;// length of current code
            nextlen = tree[n + 1].dl;
            if (++count < max_count && curlen == nextlen) {
                continue;
            } else if (count < min_count) {
                do { this.SEND_CODE(curlen, this.bl_tree); } while (--count != 0);
            } else if (curlen != 0) {
                if (curlen != prevlen) {
                    this.SEND_CODE(curlen, this.bl_tree);
                    count--;
                }
                // Assert(count >= 3 && count <= 6, " 3_6?");
                this.SEND_CODE(Constant.REP_3_6, this.bl_tree);
                this.send_bits(count - 3, 2);
            } else if (count <= 10) {
                this.SEND_CODE(Constant.REPZ_3_10, this.bl_tree);
                this.send_bits(count - 3, 3);
            } else {
                this.SEND_CODE(Constant.REPZ_11_138, this.bl_tree);
                this.send_bits(count - 11, 7);
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
    private qoutbuf = () => {
        if (this.outcnt != 0) {
            const q = this.new_queue();
            if (this.qhead == null)
                this.qhead = this.qtail = q;
            else
                this.qtail = this.qtail.next = q;
            q.len = this.outcnt - this.outoff;
            for (let i = 0; i < q.len; i++)
                q.ptr[i] = this.outbuf[this.outoff + i];
            this.outcnt = this.outoff = 0;
        }
    }

    private new_queue = (): DeflateBuffer => {
        let p = new DeflateBuffer();
        if (this.free_queue != null) {
            p = this.free_queue;
            this.free_queue = this.free_queue.next;
        }
        p.next = null;
        p.len = 0;
        p.off = 0;
        return p;
    }


    private lm_init = () => {
        /* Initialize the hash table. */
        for (let j = 0; j < Constant.HASH_SIZE; j++)
            this.prev[Constant.WSIZE + j] = 0;

        const tableItem = Constant.CONFIGURATION_TABLE[this.compr_level];
        this.max_lazy_match = tableItem.max_lazy;
        this.good_match = tableItem.good_length;
        if (!Constant.FULL_SEARCH) this.nice_match = tableItem.nice_length;
        this.max_chain_length = tableItem.max_chain;

        this.strstart = 0;
        this.block_start = 0;

        this.lookahead = this.read_buff(this.window, 0, 2 * Constant.WSIZE);
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
            this.ins_h = ((this.ins_h << Constant.H_SHIFT) ^ (this.window[j] & 0xff)) & Constant.HASH_MASK;
        }
    }

    private read_buff = (buff: Array<number>, offset: number, n: number): number => {
        let i: number;
        for (i = 0; i < n && this.deflate_pos < this.deflate_data.length; i++)
            buff[offset + i] = this.deflate_data.charCodeAt(this.deflate_pos++) & 0xff;
        return i;
    }

    private reuse_queue = (p: DeflateBuffer) => {
        p.next = this.free_queue;
        this.free_queue = p;
    }

    private fill_window = () => {
        let more = Constant.WINDOW_SIZE - this.lookahead - this.strstart;

        if (more == -1) {
            more--;
        } else if (this.strstart >= Constant.WSIZE + Constant.MAX_DIST) {
            for (let n = 0; n < Constant.WSIZE; n++)
                this.window[n] = this.window[n + Constant.WSIZE];

            this.match_start -= Constant.WSIZE;
            this.strstart -= Constant.WSIZE; /* we now have strstart >= MAX_DIST: */
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
            const n = this.read_buff(this.window, this.strstart + this.lookahead, more);
            if (n <= 0)
                this.eofile = true;
            else
                this.lookahead += n;
        }
    }

    private build_tree = (desc: DeflateTreeDesc) => { // the tree descriptor
        let tree: Array<DeflateCT> = desc.dyn_tree;
        let stree = desc.static_tree;
        let elems = desc.elems;
        let max_code = -1;	// largest code with non zero frequency
        let node = elems;	// next internal node of the tree

        this.heap_len = 0;
        this.heap_max = Constant.HEAP_SIZE;

        for (let n = 0; n < elems; n++) {
            if (tree[n].fc != 0) {
                this.heap[++this.heap_len] = max_code = n;
                this.depth[n] = 0;
            } else
                tree[n].dl = 0;
        }

        while (this.heap_len < 2) {
            let xnew = this.heap[++this.heap_len] = (max_code < 2 ? ++max_code : 0);
            tree[xnew].fc = 1;
            this.depth[xnew] = 0;
            this.opt_len--;
            if (stree != null)
                this.static_len -= stree[xnew].dl;
        }
        desc.max_code = max_code;

        for (let n = this.heap_len >> 1; n >= 1; n--)
            this.pqdownheap(tree, n);

        do {
            const n = this.heap[Constant.SMALLEST];
            this.heap[Constant.SMALLEST] = this.heap[this.heap_len--];
            this.pqdownheap(tree, Constant.SMALLEST);

            const m = this.heap[Constant.SMALLEST];  // m = node of next least frequency

            this.heap[--this.heap_max] = n;
            this.heap[--this.heap_max] = m;

            tree[node].fc = tree[n].fc + tree[m].fc;
            if (this.depth[n] > this.depth[m] + 1)
                this.depth[node] = this.depth[n];
            else
                this.depth[node] = this.depth[m] + 1;
            tree[n].dl = tree[m].dl = node;

            this.heap[Constant.SMALLEST] = node++;
            this.pqdownheap(tree, Constant.SMALLEST);

        } while (this.heap_len >= 2);

        this.heap[--this.heap_max] = this.heap[Constant.SMALLEST];

        this.gen_bitlen(desc);

        this.gen_codes(tree, max_code);
    }

    /**
     * 
     * @param tree the tree to restore.
     * @param k node to move down.
     */
    private pqdownheap = (tree: Array<DeflateCT>, k: number) => {
        let v = this.heap[k];
        let j = k << 1;	// left son of k

        while (j <= this.heap_len) {
            // Set j to the smallest of the two sons:
            if (j < this.heap_len &&
                this.SMALLER(tree, this.heap[j + 1], this.heap[j]))
                j++;

            // Exit if v is smaller than both sons
            if (this.SMALLER(tree, v, this.heap[j]))
                break;

            // Exchange v with the smallest son
            this.heap[k] = this.heap[j];
            k = j;
            // And continue down the tree, setting j to the left son of k
            j <<= 1;
        }
        this.heap[k] = v;
    }

    private SMALLER = (tree: Array<DeflateCT>, n: number, m: number): boolean => {
        return tree[n].fc < tree[m].fc ||
            (tree[n].fc == tree[m].fc && this.depth[n] <= this.depth[m]);
    }

    private gen_bitlen = (desc: DeflateTreeDesc) => { // the tree descriptor

        const tree = desc.dyn_tree;
        const extra = desc.extra_bits;
        const base = desc.extra_base;
        const max_code = desc.max_code;
        const max_length = desc.max_length;
        const stree = desc.static_tree;

        for (let bits = 0; bits <= Constant.MAX_BITS; bits++)
            this.bl_count[bits] = 0;

        /* In a first pass, compute the optimal bit lengths (which may
         * overflow in the case of the bit length tree).
         */
        tree[this.heap[this.heap_max]].dl = 0; // root of the heap

        let overflow = 0;// number of elements with bit length too large
        let h: number;
        for (h = this.heap_max + 1; h < Constant.HEAP_SIZE; h++) {
            const n = this.heap[h];
            let bits = tree[tree[n].dl].dl + 1;
            if (bits > max_length) {
                bits = max_length;
                overflow++;
            }
            tree[n].dl = bits;
            // We overwrite tree[n].dl which is no longer needed

            if (n > max_code)
                continue; // not a leaf node

            this.bl_count[bits]++;
            let xbits = 0;// extra bits
            if (n >= base)
                xbits = extra[n - base];
            const f = tree[n].fc;// frequency
            this.opt_len += f * (bits + xbits);
            if (stree != null)
                this.static_len += f * (stree[n].dl + xbits);
        }
        if (overflow == 0) return;

        // This happens for example on obj2 and pic of the Calgary corpus

        // Find the first bit length which could increase:
        do {
            let bits = max_length - 1;
            while (this.bl_count[bits] == 0)
                bits--;
            this.bl_count[bits]--;		// move one leaf down the tree
            this.bl_count[bits + 1] += 2;	// move one overflow item as its brother
            this.bl_count[max_length]--;
            /* The brother of the overflow item also moves one step up,
             * but this does not affect bl_count[max_length]
             */
            overflow -= 2;
        } while (overflow > 0);

        /* Now recompute all bit lengths, scanning in increasing frequency.
         * h is still equal to HEAP_SIZE. (It is simpler to reconstruct all
         * lengths instead of fixing only the wrong ones. This idea is taken
         * from 'ar' written by Haruhiko Okumura.)
         */
        for (let bits = max_length; bits != 0; bits--) {
            let n = this.bl_count[bits];
            while (n != 0) {
                const m = this.heap[--h];
                if (m > max_code)
                    continue;
                if (tree[m].dl != bits) {
                    this.opt_len += (bits - tree[m].dl) * tree[m].fc;
                    tree[m].fc = bits;
                }
                n--;
            }
        }
    }


    private build_bl_tree(): number {
        this.scan_tree(this.dyn_ltree, this.l_desc.max_code);
        this.scan_tree(this.dyn_dtree, this.d_desc.max_code);

        this.build_tree(this.bl_desc);
        let max_blindex: number;
        for (max_blindex = Constant.BL_CODES - 1; max_blindex >= 3; max_blindex--) {
            if (this.bl_tree[Constant.BL_ORDER[max_blindex]].dl != 0) break;
        }
        this.opt_len += 3 * (max_blindex + 1) + 5 + 5 + 4;
        return max_blindex;
    }

    /**
     * scan_tree.
     * @param tree the tree to be scanned.
     * @param max_code and its largest code of non zero frequency.
     */
    private scan_tree(tree: Array<DeflateCT>, max_code: number) {

        let max_count = 7;		// max repeat count
        let min_count = 4;		// min repeat count
        let nextlen = tree[0].dl;	// length of next code
        if (nextlen == 0) {
            max_count = 138;
            min_count = 3;
        }
        tree[max_code + 1].dl = 0xffff; // guard

        let prevlen = -1;		// last emitted length
        let count = 0;		// repeat count of the current code
        for (let n = 0; n <= max_code; n++) {
            const curlen = nextlen; // length of current code
            nextlen = tree[n + 1].dl;
            if (++count < max_count && curlen == nextlen)
                continue;
            else if (count < min_count)
                this.bl_tree[curlen].fc += count;
            else if (curlen != 0) {
                if (curlen != prevlen)
                    this.bl_tree[curlen].fc++;
                this.bl_tree[Constant.REP_3_6].fc++;
            } else if (count <= 10)
                this.bl_tree[Constant.REPZ_3_10].fc++;
            else
                this.bl_tree[Constant.REPZ_11_138].fc++;
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

}
