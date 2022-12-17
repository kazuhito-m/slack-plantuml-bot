export default class ZipState {

    private _marked:boolean = false;

    private _initflag: boolean;
    private _complete: boolean;

    constructor() {
        this._initflag = false;
        this._complete = false;
    }

    public initialize = () => {
        this.constructor();
        this._marked = true;
    }

    public completed = () => {
        this._complete = true;
    }

    public notCompleted = () => {
        this._complete = false;
    }

    // getter/setter

    public get markd():boolean {
        return this._marked;
    }

    public get initflag():boolean {
        return this._initflag;
    }

    public set initflag(value:boolean) {
        this._initflag = value;
    }

    public get complete():boolean {
        return this._complete;
    }

}
