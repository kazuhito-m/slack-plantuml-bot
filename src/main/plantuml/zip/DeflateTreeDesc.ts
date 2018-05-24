import DeflateCT from './DeflateCT';

export default class DeflateTreeDesc {

    public dyn_tree: Array<DeflateCT> | null = null;	// the dynamic tree
    public static_tree: Array<DeflateCT> | null = null;	// corresponding static tree or NULL
    public extra_bits: Array<number> = new Array<number>(0);	// extra bits for each code or NULL
    public extra_base = 0;	// base index for extra_bits
    public elems = 0;		// max number of elements in the tree
    public max_length = 0;	// max bit length for the codes
    public max_code = 0;		// largest code with non zero frequency

}
