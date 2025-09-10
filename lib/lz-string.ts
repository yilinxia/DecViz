// Minimal LZ-based string compressor tuned for URL-safe encoding.
// Provides two functions: compressToEncodedURIComponent and decompressFromEncodedURIComponent.
// Source adapted from LZ-String (MIT License): https://pieroxy.net/blog/pages/lz-string/

/* eslint-disable */

type Dict = Record<string, number>

function _compress(uncompressed: string, bitsPerChar: number, getCharFromInt: (a: number) => string): string {
    if (uncompressed == null) return ""

    let i: number
    let value: number
    const context_dictionary: Dict = {}
    const context_dictionaryToCreate: Dict = {}
    let context_c = ""
    let context_wc = ""
    let context_w = ""
    let context_enlargeIn = 2 // Compensate for the first entry which should not count
    let context_dictSize = 3
    let context_numBits = 2
    const context_data: string[] = []
    let context_data_val = 0
    let context_data_position = 0

    for (let ii = 0; ii < uncompressed.length; ii += 1) {
        context_c = uncompressed.charAt(ii)
        if (!Object.prototype.hasOwnProperty.call(context_dictionary, context_c)) {
            context_dictionary[context_c] = context_dictSize++
            context_dictionaryToCreate[context_c] = 1
        }
        context_wc = context_w + context_c
        if (Object.prototype.hasOwnProperty.call(context_dictionary, context_wc)) {
            context_w = context_wc
        } else {
            if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
                if (context_w.charCodeAt(0) < 256) {
                    for (i = 0; i < context_numBits; i++) {
                        context_data_val <<= 1
                        if (context_data_position == bitsPerChar - 1) {
                            context_data_position = 0
                            context_data.push(getCharFromInt(context_data_val))
                            context_data_val = 0
                        } else {
                            context_data_position++
                        }
                    }
                    value = context_w.charCodeAt(0)
                    for (i = 0; i < 8; i++) {
                        context_data_val = (context_data_val << 1) | (value & 1)
                        if (context_data_position == bitsPerChar - 1) {
                            context_data_position = 0
                            context_data.push(getCharFromInt(context_data_val))
                            context_data_val = 0
                        } else {
                            context_data_position++
                        }
                        value >>= 1
                    }
                } else {
                    value = 1
                    for (i = 0; i < context_numBits; i++) {
                        context_data_val = (context_data_val << 1) | value
                        if (context_data_position == bitsPerChar - 1) {
                            context_data_position = 0
                            context_data.push(getCharFromInt(context_data_val))
                            context_data_val = 0
                        } else {
                            context_data_position++
                        }
                        value = 0
                    }
                    value = context_w.charCodeAt(0)
                    for (i = 0; i < 16; i++) {
                        context_data_val = (context_data_val << 1) | (value & 1)
                        if (context_data_position == bitsPerChar - 1) {
                            context_data_position = 0
                            context_data.push(getCharFromInt(context_data_val))
                            context_data_val = 0
                        } else {
                            context_data_position++
                        }
                        value >>= 1
                    }
                }
                context_enlargeIn--
                if (context_enlargeIn == 0) {
                    context_enlargeIn = Math.pow(2, context_numBits)
                    context_numBits++
                }
                delete context_dictionaryToCreate[context_w]
            } else {
                value = context_dictionary[context_w]
                for (i = 0; i < context_numBits; i++) {
                    context_data_val = (context_data_val << 1) | (value & 1)
                    if (context_data_position == bitsPerChar - 1) {
                        context_data_position = 0
                        context_data.push(getCharFromInt(context_data_val))
                        context_data_val = 0
                    } else {
                        context_data_position++
                    }
                    value >>= 1
                }

                context_enlargeIn--
                if (context_enlargeIn == 0) {
                    context_enlargeIn = Math.pow(2, context_numBits)
                    context_numBits++
                }
            }
            // Add wc to the dictionary.
            context_dictionary[context_wc] = context_dictSize++
            context_w = String(context_c)
        }
    }

    // Output the code for w.
    if (context_w !== "") {
        if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
            if (context_w.charCodeAt(0) < 256) {
                for (i = 0; i < context_numBits; i++) {
                    context_data_val <<= 1
                    if (context_data_position == bitsPerChar - 1) {
                        context_data_position = 0
                        context_data.push(getCharFromInt(context_data_val))
                        context_data_val = 0
                    } else {
                        context_data_position++
                    }
                }
                value = context_w.charCodeAt(0)
                for (i = 0; i < 8; i++) {
                    context_data_val = (context_data_val << 1) | (value & 1)
                    if (context_data_position == bitsPerChar - 1) {
                        context_data_position = 0
                        context_data.push(getCharFromInt(context_data_val))
                        context_data_val = 0
                    } else {
                        context_data_position++
                    }
                    value >>= 1
                }
            } else {
                value = 1
                for (i = 0; i < context_numBits; i++) {
                    context_data_val = (context_data_val << 1) | value
                    if (context_data_position == bitsPerChar - 1) {
                        context_data_position = 0
                        context_data.push(getCharFromInt(context_data_val))
                        context_data_val = 0
                    } else {
                        context_data_position++
                    }
                    value = 0
                }
                value = context_w.charCodeAt(0)
                for (i = 0; i < 16; i++) {
                    context_data_val = (context_data_val << 1) | (value & 1)
                    if (context_data_position == bitsPerChar - 1) {
                        context_data_position = 0
                        context_data.push(getCharFromInt(context_data_val))
                        context_data_val = 0
                    } else {
                        context_data_position++
                    }
                    value >>= 1
                }
            }
            context_enlargeIn--
            if (context_enlargeIn == 0) {
                context_enlargeIn = Math.pow(2, context_numBits)
                context_numBits++
            }
            delete context_dictionaryToCreate[context_w]
        } else {
            value = context_dictionary[context_w]
            for (i = 0; i < context_numBits; i++) {
                context_data_val = (context_data_val << 1) | (value & 1)
                if (context_data_position == bitsPerChar - 1) {
                    context_data_position = 0
                    context_data.push(getCharFromInt(context_data_val))
                    context_data_val = 0
                } else {
                    context_data_position++
                }
                value >>= 1
            }

            context_enlargeIn--
            if (context_enlargeIn == 0) {
                context_enlargeIn = Math.pow(2, context_numBits)
                context_numBits++
            }
        }
    }

    // Mark the end of the stream
    value = 2
    for (i = 0; i < context_numBits; i++) {
        context_data_val = (context_data_val << 1) | (value & 1)
        if (context_data_position == bitsPerChar - 1) {
            context_data_position = 0
            context_data.push(getCharFromInt(context_data_val))
            context_data_val = 0
        } else {
            context_data_position++
        }
        value >>= 1
    }

    // Flush the last char
    while (true) {
        context_data_val <<= 1
        if (context_data_position == bitsPerChar - 1) {
            context_data.push(getCharFromInt(context_data_val))
            break
        } else context_data_position++
    }
    return context_data.join("")
}

function _decompress(length: number, resetValue: number, getNextValue: (index: number) => number): string {
    const dictionary: string[] = []
    let next: number
    let enlargeIn = 4
    let dictSize = 4
    let numBits = 3
    let entry = ""
    const result: string[] = []
    let i: number
    let w: string
    let bits: number
    let resb: number
    let maxpower: number
    let power: number

    const data = { val: getNextValue(0), position: resetValue, index: 1 }

    for (i = 0; i < 3; i += 1) {
        dictionary[i] = i.toString()
    }

    bits = 0
    maxpower = Math.pow(2, 2)
    power = 1
    while (power != maxpower) {
        resb = data.val & data.position
        data.position >>= 1
        if (data.position == 0) {
            data.position = resetValue
            data.val = getNextValue(data.index++)
        }
        bits |= (resb > 0 ? 1 : 0) * power
        power <<= 1
    }

    switch (bits) {
        case 0:
            bits = 0
            maxpower = Math.pow(2, 8)
            power = 1
            while (power != maxpower) {
                resb = data.val & data.position
                data.position >>= 1
                if (data.position == 0) {
                    data.position = resetValue
                    data.val = getNextValue(data.index++)
                }
                bits |= (resb > 0 ? 1 : 0) * power
                power <<= 1
            }
            next = bits
            break
        case 1:
            bits = 0
            maxpower = Math.pow(2, 16)
            power = 1
            while (power != maxpower) {
                resb = data.val & data.position
                data.position >>= 1
                if (data.position == 0) {
                    data.position = resetValue
                    data.val = getNextValue(data.index++)
                }
                bits |= (resb > 0 ? 1 : 0) * power
                power <<= 1
            }
            next = bits
            break
        case 2:
            return ""
    }

    dictionary[3] = String.fromCharCode(next)
    w = dictionary[3]
    result.push(w)

    while (true) {
        if (data.index > length) {
            return ""
        }

        bits = 0
        maxpower = Math.pow(2, numBits)
        power = 1
        while (power != maxpower) {
            resb = data.val & data.position
            data.position >>= 1
            if (data.position == 0) {
                data.position = resetValue
                data.val = getNextValue(data.index++)
            }
            bits |= (resb > 0 ? 1 : 0) * power
            power <<= 1
        }

        let c: string
        switch ((next = bits)) {
            case 0:
                bits = 0
                maxpower = Math.pow(2, 8)
                power = 1
                while (power != maxpower) {
                    resb = data.val & data.position
                    data.position >>= 1
                    if (data.position == 0) {
                        data.position = resetValue
                        data.val = getNextValue(data.index++)
                    }
                    bits |= (resb > 0 ? 1 : 0) * power
                    power <<= 1
                }
                dictionary[dictSize++] = String.fromCharCode(bits)
                next = dictSize - 1
                enlargeIn--
                break
            case 1:
                bits = 0
                maxpower = Math.pow(2, 16)
                power = 1
                while (power != maxpower) {
                    resb = data.val & data.position
                    data.position >>= 1
                    if (data.position == 0) {
                        data.position = resetValue
                        data.val = getNextValue(data.index++)
                    }
                    bits |= (resb > 0 ? 1 : 0) * power
                    power <<= 1
                }
                dictionary[dictSize++] = String.fromCharCode(bits)
                next = dictSize - 1
                enlargeIn--
                break
            case 2:
                return result.join("")
        }

        if (enlargeIn == 0) {
            enlargeIn = Math.pow(2, numBits)
            numBits++
        }

        if (dictionary[next]) {
            c = dictionary[next]
        } else {
            if (next === dictSize) {
                c = w + w.charAt(0)
            } else {
                return ""
            }
        }

        result.push(c)
        dictionary[dictSize++] = w + c.charAt(0)
        enlargeIn--
        w = c

        if (enlargeIn == 0) {
            enlargeIn = Math.pow(2, numBits)
            numBits++
        }
    }
}

const keyStrUriSafe = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$"
const baseReverseDic: Record<string, Record<string, number>> = {}

function getBaseValue(alphabet: string, character: string) {
    if (!baseReverseDic[alphabet]) {
        baseReverseDic[alphabet] = {}
        for (let i = 0; i < alphabet.length; i++) {
            baseReverseDic[alphabet][alphabet.charAt(i)] = i
        }
    }
    return baseReverseDic[alphabet][character]
}

export function compressToEncodedURIComponent(input: string): string {
    if (input == null) return ""
    return _compress(input, 6, function (a) {
        return keyStrUriSafe.charAt(a)
    })
}

export function decompressFromEncodedURIComponent(input: string | null): string {
    if (input == null) return ""
    if (input == "") return ""
    const length = input.length
    return _decompress(length, 32, function (index) {
        return getBaseValue(keyStrUriSafe, input.charAt(index))
    })
}

/* eslint-enable */


