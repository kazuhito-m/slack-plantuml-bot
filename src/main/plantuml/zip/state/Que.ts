import DeflateBuffer from "../DeflateBuffer";
import Constant from "../Constant";

export default class Quw {

    private freeQueue: DeflateBuffer | null;
    private qhead: DeflateBuffer | null;
    private qtail: DeflateBuffer | null;

    private outCount: number;
    private outOff: number;
    private outBuffer: Array<number>;

    constructor() {
        this.freeQueue = null;
        this.qhead = null;
        this.qtail = null;
        this.outBuffer = new Array(Constant.OUTBUFSIZ);
        this.outCount = 0;
        this.outOff = 0;
    }

    public initialize = () => {
        this.constructor();
    }

    public qcopy = (
        buff: Array<number>,
        off: number,
        buff_size: number
    ): number => {
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
                const p = this.qhead;
                this.qhead = this.qhead.next;
                this.reuse_queue(p);
            }
        }

        if (n == buff_size) return n;

        if (this.outOff < this.outCount) {
            i = buff_size - n;
            if (i > this.outCount - this.outOff)
                i = this.outCount - this.outOff;

            // System.arraycopy(outbuf, outoff, buff, off + n, i);
            for (j = 0; j < i; j++)
                buff[off + n + j] = this.outBuffer[this.outOff + j];
            this.outOff += i;
            n += i;
            if (this.outCount == this.outOff) {
                this.outCount = 0;
                this.outOff = 0;
            }
        }
        return n;
    }

    private reuse_queue = (p: DeflateBuffer) => {
        p.next = this.freeQueue;
        this.freeQueue = p;
    }

    public queClear = () => {
        this.qhead = null;
        this.outCount = 0;
        this.outOff = 0;
    }

    public nothingQueHead = () => {
        return this.qhead == null;
    }

    public put_short = (w: number) => {
        w &= 0xffff;
        if (this.outOff + this.outCount < Constant.OUTBUFSIZ - 2) {
            this.outBuffer[this.outOff + this.outCount++] = (w & 0xff);
            this.outBuffer[this.outOff + this.outCount++] = (w >>> 8);
        } else {
            this.put_byte(w & 0xff);
            this.put_byte(w >>> 8);
        }
    }

    public put_byte = (c: number) => {
        this.outBuffer[this.outOff + this.outCount++] = c;
        if (this.outOff + this.outCount == Constant.OUTBUFSIZ)
            this.qoutbuf();
    }

    private qoutbuf = () => {
        if (this.outCount != 0) {
            const q = this.new_queue();
            if (this.qhead == null)
                this.qhead = this.qtail = q;
            else
                this.qtail = q;
            this.qtail.next = q;
            q.len = this.outCount - this.outOff;
            for (let i = 0; i < q.len; i++)
                q.ptr[i] = this.outBuffer[this.outOff + i];
            this.outCount = this.outOff = 0;
        }
    }

    private new_queue = (): DeflateBuffer => {
        let p = new DeflateBuffer();
        if (this.freeQueue != null) {
            p = this.freeQueue;
            this.freeQueue = this.freeQueue.next;
        }
        p.next = null;
        p.len = 0;
        p.off = 0;
        return p;
    }

}
