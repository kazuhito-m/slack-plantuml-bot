import Constant from "../Constant";

export default class DeflateState {

    private _window: Array<number>;
    private _strstart: number = 0;
    private _match_start: number;

    public deflate_data:string | undefined;
    public deflate_pos: number = 0;

    constructor() {
        this._window = new Array(Constant.WINDOW_SIZE);
        this._match_start = 0;
    }

    public initialize = () => {
        this.constructor();
    }

    public initDeflateData = (str: string) => {
        this.deflate_data = str;
        this.deflate_pos = 0;
    }

    public read_buff = (offset: number, n: number): number => {
        if (!this.deflate_data) return 0;
        const buff = this._window;
        let i: number;
        for (i = 0; i < n && this.deflate_pos < this.deflate_data.length; i++)
            buff[offset + i] = this.deflate_data.charCodeAt(this.deflate_pos++) & 0xff;
        return i;
    }

    public positionCodeOffset = (offset: number): number => {
        return this._window[this._strstart + offset] & 0xff;
    }

    public firstPositionCode = (): number => {
        return this.positionCodeOffset(0);
    }

    public moveNextStartPostion = () => {
        this._strstart++;
    }

    public movePosition = (length: number) => {
        this._strstart += length;
    }

    public clearPosition = () => {
        this._strstart = 0;
    }

    // getter/setter

    public get window(): Array<number> {
        return this._window;
    }

    public get strstart() {
        return this._strstart;
    }

    public get match_start() {
        return this._match_start;
    }

    public set match_start(value: number) {
        this._match_start = value;
    }

}
