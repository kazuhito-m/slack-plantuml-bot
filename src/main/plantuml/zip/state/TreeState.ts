import DeflateCT from "../DeflateCT";
import Constant from "../Constant";

export default class TreeState {

    private _bl_tree: Array<DeflateCT>;

    constructor() {
        this._bl_tree = this.createDeflateArray(2 * Constant.BL_CODES + 1);
    }

    public initialize = () => {
        this.constructor();
    }

    public getItemWithOrder = (index:number) => {
        return this._bl_tree[Constant.BL_ORDER[index]];
    }

    public claerAllFc = () => {
        for (let n = 0; n < this._bl_tree.length; n++) this._bl_tree[n].fc = 0;
    }

    /**
     * scan_tree.
     * @param tree the tree to be scanned.
     * @param max_code and its largest code of non zero frequency.
     */
    public scan_tree(tree: Array<DeflateCT>, max_code: number) {

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
                this._bl_tree[curlen].fc += count;
            else if (curlen != 0) {
                if (curlen != prevlen)
                    this._bl_tree[curlen].fc++;
                this._bl_tree[Constant.REP_3_6].fc++;
            } else if (count <= 10)
                this._bl_tree[Constant.REPZ_3_10].fc++;
            else
                this._bl_tree[Constant.REPZ_11_138].fc++;
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

    // utility methods

    private createDeflateArray(itemCount: number): Array<DeflateCT> {
        const tree = new Array<DeflateCT>(itemCount);
        for (let i = 0; i < itemCount; i++) tree[i] = new DeflateCT();
        return tree;
    }

    // getter/setter

    public get bl_tree(): Array<DeflateCT> {
        return this._bl_tree;
    }

}
