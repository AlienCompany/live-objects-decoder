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

/**
 * covert string of hexa to him binary value
 * @param hexaStr haxa value as string (should not prefixed by '0x')
 */
function hexaToBinary(hexaStr: string): string {
    return hexaStr.split('').map((hexaChar) => {// replace each charater by him binary value:
        let b = parseInt(hexaChar, 16).toString(2); // parseInt(convert hexa char to int value)=>toString(covert int to binary value in string)
        while (b.length < 4) b = '0' + b; // adding '0' before value for complete the 4 bit (exemple: convert "10" to "0010")
        return b;
    }).join('') // join character converted in binary by nothing for got the big binary string.(covert ["0000","0101", "1011",...] to "000001011011...")
}

/**
 * extract succesive value in binary string
 * @param binary string consisting of '0' and '1'
 * @param sequances string size of sucessive value
 * @param startedIndex index of first sequance (default value is 0)
 *
 * Exemple: binaryParse("010101100111010010010101001", [3,2,4,6], 5)
 * startedIndex (first 5 char is ignored) => "01010"
 * sequance 0 (length = 3) => "110" => 6
 * sequance 1 (length = 2) => "01" => 1
 * sequance 2 (length = 4) => "1101" => 13
 * sequance 3 (length = 6) => "001001" => 9
 * return [6,1,13,9]
 */
function binaryParse(binary: string, sequances: number[], startedIndex: number = 0): number[]{
  let currantIndex = startedIndex;
  return sequances.map((sequanceLength)=> {
    const value = parseInt(binary.substr(currantIndex, sequanceLength),2);
    currantIndex += sequanceLength;
    return value;
  });
}

/**
 * @param values: array of values (null or undefined value is ignored)
 * @return return average of values or null if array haven't number
 */
function average( values: (number | null)[]): number | null {
  const valuesNotNull = values.filter((value) => value != null);
  if(valuesNotNull.length === 0) return null;
  return valuesNotNull.reduce((a,b)=>a+b) / valuesNotNull.length;
}

/**
 * convert tram value to null if tram value === "1111111"
 * @param value in tram
 * @return temperature
 */
function value127ToNull(value: number): number | null {
	return value === 0b1111111 ? null : value;
}

/**
 * convert tram value to temperature value
 * @param value in tram
 * @return temperature
 */
function valueToTemperature(value: number): number{
	if(value === null) return null;

	const temperatureScale = 0.5;
	const temperatureOffset = 36 - 50;

	return value * temperatureScale + temperatureOffset
}

/**
 * convert tram value to co2 value
 * @param value in tram
 * @return temperature
 */
function valueToCo2(value: number): number{
	if(value === null) return null;

	const co2Scale = 32;
	return value * co2Scale;
}

/**
 * parse binary tram (from Expert0 doc)
 * @param binary
 */
function getExpert0(binary: string): OutExpert0{
  	const values = binaryParse(binary, [4,3,1,4,7,7,7,7,7,7,7,7,7,7,7,7]);
	const res: Partial<OutExpert0> = {
		type: values[0],
		y: values[1],
		z: values[2],
		v: values[3],
		extT0: valueToTemperature(value127ToNull(values[4])),
		extT1: valueToTemperature(value127ToNull(values[5])),
		extT2: valueToTemperature(value127ToNull(values[6])),
		extT3: valueToTemperature(value127ToNull(values[7])),
		humT0: value127ToNull(values[8]),
		humT1: value127ToNull(values[9]),
		humT2: value127ToNull(values[10]),
		humT3: value127ToNull(values[11]),
		co2T0: valueToCo2(value127ToNull(values[12])),
		co2T1: valueToCo2(value127ToNull(values[13])),
		co2T2: valueToCo2(value127ToNull(values[14])),
		co2T3: valueToCo2(value127ToNull(values[15]))
    };

	res.extMoy = average([res.extT0,res.extT1,res.extT2,res.extT3]);
  	res.humMoy = average([res.humT0,res.humT1,res.humT2,res.humT3]);
  	res.co2Moy = average([res.co2T0,res.co2T1,res.co2T2,res.co2T3]);

	return res as OutExpert0;
}

/**
 * parse tram to JSON string
 * this function is the main function called by Orange
 */
function decode(tramHexa: string): string {
	const tramBinary = hexaToBinary(tramHexa); // convert hexaTram to binary tram

	try{

		const type = parseInt(tramBinary.substr(0, 4),2);
		if(type === 0){
			return JSON.stringify(getExpert0(tramBinary));
		} else {
			throw new Error('Type ' + type + ' is unknown');
		}
	}catch (error) {
		return JSON.stringify({error: {message: error.message, stack: error.stack}});
	}
}

