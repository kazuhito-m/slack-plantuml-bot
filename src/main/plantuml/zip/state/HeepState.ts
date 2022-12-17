import DeflateCT from "../DeflateCT";
import Constant from "../Constant";
import DeflateTreeDesc from "../DeflateTreeDesc";

export default class HeepState {

    private _bl_count: Array<number>;

    private heap: Array<number>;
    private depth: Array<number>;

    private _opt_len: number = 0;
    private _static_len: number = 0;

    constructor() {
        this._bl_count = new Array(Constant.MAX_BITS + 1);
        this.heap = new Array(2 * Constant.L_CODES + 1);
        this.depth = new Array(2 * Constant.L_CODES + 1);
    }

    public initialize = () => {
        this.constructor();
    }

    public build_tree = (desc: DeflateTreeDesc) => { // the tree descriptor
        if (!desc.dyn_tree) throw new Error();  // 後付けチェック TODO 消したい
        
        const tree = desc.dyn_tree;
        const stree = desc.static_tree;
        const elems = desc.elems;

        let heap_len = 0;
        let heap_max = Constant.HEAP_SIZE;

        let max_code = -1;	// largest code with non zero frequency
        for (let n = 0; n < elems; n++) {
            if (tree[n].fc != 0) {
                max_code = n;
                this.heap[++heap_len] = max_code;
                this.depth[n] = 0;
            } else
                tree[n].dl = 0;
        }

        while (heap_len < 2) {
            let xnew = this.heap[++heap_len] = (max_code < 2 ? ++max_code : 0);
            tree[xnew].fc = 1;
            this.depth[xnew] = 0;
            this._opt_len--;
            if (stree != null)
                this._static_len -= stree[xnew].dl;
        }
        desc.max_code = max_code;

        for (let n = heap_len >> 1; n >= 1; n--)
            this.pqdownheap(tree, n, heap_len);

        let node = elems;	// next internal node of the tree
        do {
            const n = this.heap[Constant.SMALLEST];
            this.heap[Constant.SMALLEST] = this.heap[heap_len--];
            this.pqdownheap(tree, Constant.SMALLEST, heap_len);

            const m = this.heap[Constant.SMALLEST];  // m = node of next least frequency

            this.heap[--heap_max] = n;
            this.heap[--heap_max] = m;

            tree[node].fc = tree[n].fc + tree[m].fc;
            if (this.depth[n] > this.depth[m] + 1)
                this.depth[node] = this.depth[n];
            else
                this.depth[node] = this.depth[m] + 1;
            tree[n].dl = tree[m].dl = node;

            this.heap[Constant.SMALLEST] = node++;
            this.pqdownheap(tree, Constant.SMALLEST, heap_len);

        } while (heap_len >= 2);

        this.heap[--heap_max] = this.heap[Constant.SMALLEST];

        this.gen_bitlen(desc, heap_max);

        this.gen_codes(tree, max_code);
    }

    /**
     * 
     * @param tree the tree to restore.
     * @param k node to move down.
     */
    private pqdownheap = (tree: Array<DeflateCT>, k: number , heap_len:number) => {
        let v = this.heap[k];
        let j = k << 1;	// left son of k

        while (j <= heap_len) {
            // Set j to the smallest of the two sons:
            if (j < heap_len &&
                this.SMALLER(tree, this.heap[j + 1], this.heap[j]))
                j++;

            // Exit if v is smaller than both sons
            if (this.SMALLER(tree, v, this.heap[j])) break;

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

    private gen_bitlen = (desc: DeflateTreeDesc, heap_max:number) => { // the tree descriptor
        if (!desc.dyn_tree) throw new Error();  // 後付けチェック TODO 消したい
        
        const tree = desc.dyn_tree;
        const extra = desc.extra_bits;
        const base = desc.extra_base;
        const max_code = desc.max_code;
        const max_length = desc.max_length;
        const stree = desc.static_tree;

        for (let bits = 0; bits <= Constant.MAX_BITS; bits++)
            this._bl_count[bits] = 0;

        /* In a first pass, compute the optimal bit lengths (which may
         * overflow in the case of the bit length tree).
         */
        tree[this.heap[heap_max]].dl = 0; // root of the heap

        let overflow = 0;// number of elements with bit length too large
        let h: number;
        for (h = heap_max + 1; h < Constant.HEAP_SIZE; h++) {
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

            this._bl_count[bits]++;
            let xbits = 0;// extra bits
            if (n >= base)
                xbits = extra[n - base];
            const f = tree[n].fc;// frequency
            this._opt_len += f * (bits + xbits);
            if (stree != null)
                this._static_len += f * (stree[n].dl + xbits);
        }
        if (overflow == 0) return;

        // This happens for example on obj2 and pic of the Calgary corpus

        // Find the first bit length which could increase:
        do {
            let bits = max_length - 1;
            while (this._bl_count[bits] == 0)
                bits--;
            this._bl_count[bits]--;		// move one leaf down the tree
            this._bl_count[bits + 1] += 2;	// move one overflow item as its brother
            this._bl_count[max_length]--;
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
            let n = this._bl_count[bits];
            while (n != 0) {
                const m = this.heap[--h];
                if (m > max_code)
                    continue;
                if (tree[m].dl != bits) {
                    this._opt_len += (bits - tree[m].dl) * tree[m].fc;
                    tree[m].fc = bits;
                }
                n--;
            }
        }
    }

    /**
     * gen_codes.
     * @param tree the tree to decorate.
     * @param max_code largest code with non zero frequency.
     */
    public gen_codes = (tree: Array<DeflateCT>, max_code: number) => {
        const next_code = new Array(Constant.MAX_BITS + 1); // next code value for each bit length
        let code = 0;		// running code value

        for (let bits = 1; bits <= Constant.MAX_BITS; bits++) {
            code = ((code + this._bl_count[bits - 1]) << 1);
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
    public bi_reverse = (code: number, len: number) => {
        let res = 0;
        do {
            res |= code & 1;
            code >>= 1;
            res <<= 1;
        } while (--len > 0);
        return res >> 1;
    }

    // utility methods

    public addOptLength = (value:number) => {
        this._opt_len += value;
    }

    public clearBlCounts = () => {
        for (let bits = 0; bits < this._bl_count.length; bits++)
            this._bl_count[bits] = 0;
    }

    public clearLength = () => {
        this._opt_len = 0;
        this._static_len = 0;
    }

    public initialSetBlCount = () => {
        this.clearBlCounts();
        let n = 0;
        while (n <= 143) { n++; this._bl_count[8]++; }
        while (n <= 255) { n++; this._bl_count[9]++; }
        while (n <= 279) { n++; this._bl_count[7]++; }
        while (n <= 287) { n++; this._bl_count[8]++; }
    }

    // getter/setter

    public get opt_len():number {
        return this._opt_len;
    }

    public get static_len():number {
        return this._static_len;
    }

}
