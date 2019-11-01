export {};
// ========== TYPE & INTERFACE ==========
// ---------- Global ----------
type KeyOfType<Obj, T> = { [K in keyof Obj]: Obj[K] extends T ? K : never }[keyof Obj];
interface Pipe<A, B = A> {
    (value: A): B;
}

// ---------- For decoders ----------
type ParseFormatElement<T> = [KeyOfType<T, number>, number, Pipe<number>[]];
type ParseFormat<T> = ParseFormatElement<T>[];

// ---------- Specific interface ----------

interface OutExpert0{
    type: number;
    y: number;
    z: number;
    v: number;
    extT0: number;
    extT1: number;
    extT2: number;
    extT3: number;
    humT0: number;
    humT1: number;
    humT2: number;
    humT3: number;
    co2T0: number;
    co2T1: number;
    co2T2: number;
    co2T3: number;
    extMoy: number;
    humMoy: number;
    co2Moy: number;
}

type OutData = OutExpert0;  // | OutExpert1

// ========== Const ==========
// ---------- Vars ----------
const ERROR_VALUE = 'ERROR' as any;
// const ERROR_VALUE = undefined as any;

const temperatureScale = 0.5;
const temperatureOffset = 36 - 50;

// ---------- Pipies ----------
const pipe127IsError: Pipe<number> = (value) => value === 127 ? ERROR_VALUE : value;
const pipeTemperatue: Pipe<number> = (value) => isNaN(value) ? value : value * temperatureScale + temperatureOffset;
const pipeCo2: Pipe<number> = (value) => value * 32;

// ========== Function ==========
// ---------- Global -----------

/**
 * covert array of string to an array of value using object has map
 * @param data mapping of key to value
 * @param keys array of mapping key
 */
function extract<T, K extends keyof T>(data: T, keys: K[]): T[K][] {
    return keys.map((key: K) => data[key]);
}

/**
 * return the average of the array.
 * values that is not a number is ignored.
 * return ERROR_VALUE if array don't contain number.
 * @param values array of values
 */
function avrg(values: number[]): number {
    const valuesWithoutNan = values.filter((v) => !isNaN(v)); // remove values that is not a number;
    if (!valuesWithoutNan.length) return ERROR_VALUE; // if array is emptty => no value in array
    return valuesWithoutNan.reduce((a, b) => a + b) / valuesWithoutNan.length; // use reduce for do the sum and divise the sum by the number of ellement in array
}

/**
 * covert string of hexa to him binary value
 * @param hexaStr haxa value as string (should not prefixed by '0x')
 */
function hexaToBinary(hexaStr: string): string {
    return hexaStr.split('').map((hexaChar) => {// replace each charater by him binary value:
        let b = parseInt(hexaChar, 16).toString(2); // parseInt(convert hexa char to int value)=>toString(covert int to binary value in string)
        while (b.length < 4) { // adding '0' before value for complete the 4 bit (exemple: convert "10" to "0010")
            b = '0' + b;
        }
        return b;
    }).join('') // join character converted in binary by nothing for got the big binary string.(covert ["0000","0101", "1011",...] to "000001011011...")
}

// ---------- For decoders ----------
function parse<T>(format: ParseFormat<T>, binary: string): T {
    let offset = 0; // contain the number off bit readed (start at 0)
    let res = {} as T; // constain the final object;

    format.forEach(info => {

        let value = parseInt(binary.substr(offset, info[1]), 2);
        offset += info[1];

        // @ts-ignore
        res[info[0]] = info[2].reduce((previous, fn) => fn(previous), value);
    });

    return res;
}

// ========== Core ==========
function doDecodeExpert0(ecoded: string, binary: string): OutExpert0 {

    const test: ParseFormat<OutExpert0> = [
        ['type', 4, []],
        ['y', 3, []],
        ['z', 1, []],
        ['v', 4, []],
        ['extT0', 7, [pipe127IsError, pipeTemperatue]],
        ['extT1', 7, [pipe127IsError, pipeTemperatue]],
        ['extT2', 7, [pipe127IsError, pipeTemperatue]],
        ['extT3', 7, [pipe127IsError, pipeTemperatue]],
        ['humT0', 7, [pipe127IsError]],
        ['humT1', 7, [pipe127IsError]],
        ['humT2', 7, [pipe127IsError]],
        ['humT3', 7, [pipe127IsError]],
        ['co2T0', 7, [pipe127IsError, pipeCo2]],
        ['co2T1', 7, [pipe127IsError, pipeCo2]],
        ['co2T2', 7, [pipe127IsError, pipeCo2]],
        ['co2T3', 7, [pipe127IsError, pipeCo2]],
    ];
    let res = parse(test, binary);

    res.extMoy = avrg(extract(res, ['extT0', 'extT1', 'extT2', 'extT3']));
    res.humMoy = avrg(extract(res, ['humT0', 'humT1', 'humT2', 'humT3']));
    res.co2Moy = avrg(extract(res, ['co2T0', 'co2T1', 'co2T2', 'co2T3']));

    return res;
}

function doDecode(encoded: string): OutData {

    let binary: string = hexaToBinary(encoded);
    let typeTrame: number = parseInt(binary.substr(0, 4), 2);

    if (typeTrame === 0) {
        return doDecodeExpert0(encoded, binary);
        // } else if (type === 1) { // todo
        //     return doDecodeExpert1(encoded, binary)
        // } else if (type === 2) { // todo
        //     return doDecodeExpert2(encoded, binary)
    } else {
        throw {message: 'type unknown', type: typeTrame};
    }


}

const decode = function (encoded: string): string {

    try {
        return JSON.stringify(doDecode(encoded));
    } catch (e) {
        return JSON.stringify({'error': e, encoded: encoded});
    }
};

// For test in browser
// window.decode = decode;
