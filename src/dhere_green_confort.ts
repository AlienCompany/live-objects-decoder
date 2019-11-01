export {};

interface Pipe<A, B = A> {
	(value: A): B;
}

type KeyOfType<Obj, T> = { [K in keyof Obj]: Obj[K] extends T ? K : never }[keyof Obj];

type ParseFormatElement<T> = [KeyOfType<T, number>, number, Pipe<number>[]];
type ParseFormat<T> = ParseFormatElement<T>[];

const ERROR_VALUE = 'ERROR' as any;

const temperatureScale = 0.5;
const temperatureOffset = 36 - 50;

const pipe127IsError: Pipe<number> = (value) => value === 127 ? ERROR_VALUE : value;
const pipeTemperatue: Pipe<number> = (value) => isNaN(value) ? value : value * temperatureScale + temperatureOffset;

function parse<T>(format: ParseFormat<T>, binary: string): T {
	let offset = 0;
	let res = {} as T;

	format.forEach(info => {

		let value = parseInt(binary.substr(offset, info[1]), 2);
		offset += info[1];

		// @ts-ignore
		res[info[0]] = info[2].reduce((previous, fn) => fn(previous), value);
	});

	return res;
}

function extract<T, K extends keyof T>(data: T, keys: K[]): T[K][] {
	return keys.map((key: K) => data[key]);
}

function avrg(values: number[]): number {
	values = values.filter((v) => !isNaN(v));
	if (!values.length) return ERROR_VALUE;
	return values.reduce((a, b) => a + b) / values.length;
}

interface OutExpert0{
	type: number;
	y: number;
	r: number;
	v: number;
	extT0: number;
	extT2: number;
	extT4: number;
	extT6: number;
	extT8: number;
	extT10: number;
	humT0: number;
	humT2: number;
	humT4: number;
	humT6: number;
	humT8: number;
	humT10: number;
	extMoy: number;
	humMoy: number;
}

type OutData = OutExpert0;  // | OutExpert1

function doDecodeExpert0(ecoded: string, binary: string): OutExpert0 {

	const test: ParseFormat<OutExpert0> = [
		['type', 4, []],
		['y', 3, []],
		['r', 1, []],
		['v', 4, []],
		['extT0', 7, [pipe127IsError,pipeTemperatue]],
		['extT2', 7, [pipe127IsError,pipeTemperatue]],
		['extT4', 7, [pipe127IsError,pipeTemperatue]],
		['extT6', 7, [pipe127IsError,pipeTemperatue]],
		['extT8', 7, [pipe127IsError,pipeTemperatue]],
		['extT10', 7, [pipe127IsError,pipeTemperatue]],
		['humT0', 7, [pipe127IsError]],
		['humT2', 7, [pipe127IsError]],
		['humT4', 7, [pipe127IsError]],
		['humT6', 7, [pipe127IsError]],
		['humT8', 7, [pipe127IsError]],
		['humT10', 7, [pipe127IsError]]
	];
	let res = parse(test, binary);

	res.extMoy = avrg(extract(res, ['extT0', 'extT2', 'extT4', 'extT6', 'extT8', 'extT10']));
	res.humMoy = avrg(extract(res, ['humT0', 'humT2', 'humT4', 'humT6', 'humT8', 'humT10']));

	return res;
}

function hexaToBinary(hexaStr: string): string {
	return hexaStr.split('').map((hexaChar) => {
		let b = parseInt(hexaChar, 16).toString(2);
		while (b.length < 4) {
			b = '0' + b;
		}
		return b;
	}).join('')
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
