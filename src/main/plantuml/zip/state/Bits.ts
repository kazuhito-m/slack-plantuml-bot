import Que from "./Que";

export default class DeflateState {

    private bi_buf: number;
    private bi_valid: number;

    constructor() {
        this.bi_buf = 0;
        this.bi_valid = 0;
    }

    public initialize = () => {
        this.constructor();
    }

    /**
     * send_bits.
     * @param value value to send. 
     * @param length  number of bits.
     */
    public send_bits = (value: number, length: number, que:Que) => {
        const BUF_SIZE = 16; // bit size of bi_buf
        if (this.bi_valid > BUF_SIZE - length) {
            this.bi_buf |= (value << this.bi_valid);
            que.put_short(this.bi_buf);
            this.bi_buf = (value >> (BUF_SIZE - this.bi_valid));
            this.bi_valid += length - BUF_SIZE;
        } else {
            this.bi_buf |= value << this.bi_valid;
            this.bi_valid += length;
        }
    }

    public bi_windup = (que:Que) => {
        if (this.bi_valid > 8) {
            que.put_short(this.bi_buf);
        } else if (this.bi_valid > 0) {
            que.put_byte(this.bi_buf);
        }
        this.initialize();
    }

}
