module.exports = [
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/Options.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.getDefaultOptions = exports.defaultOptions = exports.jsonDescription = exports.ignoreOverride = void 0;
exports.ignoreOverride = Symbol("Let zodToJsonSchema decide on which parser to use");
const jsonDescription = (jsonSchema, def)=>{
    if (def.description) {
        try {
            return {
                ...jsonSchema,
                ...JSON.parse(def.description)
            };
        } catch  {}
    }
    return jsonSchema;
};
exports.jsonDescription = jsonDescription;
exports.defaultOptions = {
    name: undefined,
    $refStrategy: "root",
    basePath: [
        "#"
    ],
    effectStrategy: "input",
    pipeStrategy: "all",
    dateStrategy: "format:date-time",
    mapStrategy: "entries",
    removeAdditionalStrategy: "passthrough",
    allowedAdditionalProperties: true,
    rejectedAdditionalProperties: false,
    definitionPath: "definitions",
    target: "jsonSchema7",
    strictUnions: false,
    definitions: {},
    errorMessages: false,
    markdownDescription: false,
    patternStrategy: "escape",
    applyRegexFlags: false,
    emailStrategy: "format:email",
    base64Strategy: "contentEncoding:base64",
    nameStrategy: "ref",
    openAiAnyTypeName: "OpenAiAnyType"
};
const getDefaultOptions = (options)=>typeof options === "string" ? {
        ...exports.defaultOptions,
        name: options
    } : {
        ...exports.defaultOptions,
        ...options
    };
exports.getDefaultOptions = getDefaultOptions;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/Refs.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.getRefs = void 0;
const Options_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/Options.js [instrumentation] (ecmascript)");
const getRefs = (options)=>{
    const _options = (0, Options_js_1.getDefaultOptions)(options);
    const currentPath = _options.name !== undefined ? [
        ..._options.basePath,
        _options.definitionPath,
        _options.name
    ] : _options.basePath;
    return {
        ..._options,
        flags: {
            hasReferencedOpenAiAnyType: false
        },
        currentPath: currentPath,
        propertyPath: undefined,
        seen: new Map(Object.entries(_options.definitions).map(([name, def])=>[
                def._def,
                {
                    def: def._def,
                    path: [
                        ..._options.basePath,
                        _options.definitionPath,
                        name
                    ],
                    // Resolution of references will be forced even though seen, so it's ok that the schema is undefined here for now.
                    jsonSchema: undefined
                }
            ]))
    };
};
exports.getRefs = getRefs;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/errorMessages.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.setResponseValueAndErrors = exports.addErrorMessage = void 0;
function addErrorMessage(res, key, errorMessage, refs) {
    if (!refs?.errorMessages) return;
    if (errorMessage) {
        res.errorMessage = {
            ...res.errorMessage,
            [key]: errorMessage
        };
    }
}
exports.addErrorMessage = addErrorMessage;
function setResponseValueAndErrors(res, key, value, errorMessage, refs) {
    res[key] = value;
    addErrorMessage(res, key, errorMessage, refs);
}
exports.setResponseValueAndErrors = setResponseValueAndErrors;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/getRelativePath.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.getRelativePath = void 0;
const getRelativePath = (pathA, pathB)=>{
    let i = 0;
    for(; i < pathA.length && i < pathB.length; i++){
        if (pathA[i] !== pathB[i]) break;
    }
    return [
        (pathA.length - i).toString(),
        ...pathB.slice(i)
    ].join("/");
};
exports.getRelativePath = getRelativePath;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/any.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseAnyDef = void 0;
const getRelativePath_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/getRelativePath.js [instrumentation] (ecmascript)");
function parseAnyDef(refs) {
    if (refs.target !== "openAi") {
        return {};
    }
    const anyDefinitionPath = [
        ...refs.basePath,
        refs.definitionPath,
        refs.openAiAnyTypeName
    ];
    refs.flags.hasReferencedOpenAiAnyType = true;
    return {
        $ref: refs.$refStrategy === "relative" ? (0, getRelativePath_js_1.getRelativePath)(anyDefinitionPath, refs.currentPath) : anyDefinitionPath.join("/")
    };
}
exports.parseAnyDef = parseAnyDef;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/array.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseArrayDef = void 0;
const v3_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/index.cjs [instrumentation] (ecmascript)");
const errorMessages_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/errorMessages.js [instrumentation] (ecmascript)");
const parseDef_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parseDef.js [instrumentation] (ecmascript)");
function parseArrayDef(def, refs) {
    const res = {
        type: "array"
    };
    if (def.type?._def && def.type?._def?.typeName !== v3_1.ZodFirstPartyTypeKind.ZodAny) {
        res.items = (0, parseDef_js_1.parseDef)(def.type._def, {
            ...refs,
            currentPath: [
                ...refs.currentPath,
                "items"
            ]
        });
    }
    if (def.minLength) {
        (0, errorMessages_js_1.setResponseValueAndErrors)(res, "minItems", def.minLength.value, def.minLength.message, refs);
    }
    if (def.maxLength) {
        (0, errorMessages_js_1.setResponseValueAndErrors)(res, "maxItems", def.maxLength.value, def.maxLength.message, refs);
    }
    if (def.exactLength) {
        (0, errorMessages_js_1.setResponseValueAndErrors)(res, "minItems", def.exactLength.value, def.exactLength.message, refs);
        (0, errorMessages_js_1.setResponseValueAndErrors)(res, "maxItems", def.exactLength.value, def.exactLength.message, refs);
    }
    return res;
}
exports.parseArrayDef = parseArrayDef;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/bigint.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseBigintDef = void 0;
const errorMessages_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/errorMessages.js [instrumentation] (ecmascript)");
function parseBigintDef(def, refs) {
    const res = {
        type: "integer",
        format: "int64"
    };
    if (!def.checks) return res;
    for (const check of def.checks){
        switch(check.kind){
            case "min":
                if (refs.target === "jsonSchema7") {
                    if (check.inclusive) {
                        (0, errorMessages_js_1.setResponseValueAndErrors)(res, "minimum", check.value, check.message, refs);
                    } else {
                        (0, errorMessages_js_1.setResponseValueAndErrors)(res, "exclusiveMinimum", check.value, check.message, refs);
                    }
                } else {
                    if (!check.inclusive) {
                        res.exclusiveMinimum = true;
                    }
                    (0, errorMessages_js_1.setResponseValueAndErrors)(res, "minimum", check.value, check.message, refs);
                }
                break;
            case "max":
                if (refs.target === "jsonSchema7") {
                    if (check.inclusive) {
                        (0, errorMessages_js_1.setResponseValueAndErrors)(res, "maximum", check.value, check.message, refs);
                    } else {
                        (0, errorMessages_js_1.setResponseValueAndErrors)(res, "exclusiveMaximum", check.value, check.message, refs);
                    }
                } else {
                    if (!check.inclusive) {
                        res.exclusiveMaximum = true;
                    }
                    (0, errorMessages_js_1.setResponseValueAndErrors)(res, "maximum", check.value, check.message, refs);
                }
                break;
            case "multipleOf":
                (0, errorMessages_js_1.setResponseValueAndErrors)(res, "multipleOf", check.value, check.message, refs);
                break;
        }
    }
    return res;
}
exports.parseBigintDef = parseBigintDef;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/boolean.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseBooleanDef = void 0;
function parseBooleanDef() {
    return {
        type: "boolean"
    };
}
exports.parseBooleanDef = parseBooleanDef;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/branded.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseBrandedDef = void 0;
const parseDef_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parseDef.js [instrumentation] (ecmascript)");
function parseBrandedDef(_def, refs) {
    return (0, parseDef_js_1.parseDef)(_def.type._def, refs);
}
exports.parseBrandedDef = parseBrandedDef;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/catch.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseCatchDef = void 0;
const parseDef_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parseDef.js [instrumentation] (ecmascript)");
const parseCatchDef = (def, refs)=>{
    return (0, parseDef_js_1.parseDef)(def.innerType._def, refs);
};
exports.parseCatchDef = parseCatchDef;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/date.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseDateDef = void 0;
const errorMessages_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/errorMessages.js [instrumentation] (ecmascript)");
function parseDateDef(def, refs, overrideDateStrategy) {
    const strategy = overrideDateStrategy ?? refs.dateStrategy;
    if (Array.isArray(strategy)) {
        return {
            anyOf: strategy.map((item, i)=>parseDateDef(def, refs, item))
        };
    }
    switch(strategy){
        case "string":
        case "format:date-time":
            return {
                type: "string",
                format: "date-time"
            };
        case "format:date":
            return {
                type: "string",
                format: "date"
            };
        case "integer":
            return integerDateParser(def, refs);
    }
}
exports.parseDateDef = parseDateDef;
const integerDateParser = (def, refs)=>{
    const res = {
        type: "integer",
        format: "unix-time"
    };
    if (refs.target === "openApi3") {
        return res;
    }
    for (const check of def.checks){
        switch(check.kind){
            case "min":
                (0, errorMessages_js_1.setResponseValueAndErrors)(res, "minimum", check.value, check.message, refs);
                break;
            case "max":
                (0, errorMessages_js_1.setResponseValueAndErrors)(res, "maximum", check.value, check.message, refs);
                break;
        }
    }
    return res;
};
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/default.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseDefaultDef = void 0;
const parseDef_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parseDef.js [instrumentation] (ecmascript)");
function parseDefaultDef(_def, refs) {
    return {
        ...(0, parseDef_js_1.parseDef)(_def.innerType._def, refs),
        default: _def.defaultValue()
    };
}
exports.parseDefaultDef = parseDefaultDef;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/effects.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseEffectsDef = void 0;
const parseDef_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parseDef.js [instrumentation] (ecmascript)");
const any_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/any.js [instrumentation] (ecmascript)");
function parseEffectsDef(_def, refs) {
    return refs.effectStrategy === "input" ? (0, parseDef_js_1.parseDef)(_def.schema._def, refs) : (0, any_js_1.parseAnyDef)(refs);
}
exports.parseEffectsDef = parseEffectsDef;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/enum.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseEnumDef = void 0;
function parseEnumDef(def) {
    return {
        type: "string",
        enum: Array.from(def.values)
    };
}
exports.parseEnumDef = parseEnumDef;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/intersection.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseIntersectionDef = void 0;
const parseDef_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parseDef.js [instrumentation] (ecmascript)");
const isJsonSchema7AllOfType = (type)=>{
    if ("type" in type && type.type === "string") return false;
    return "allOf" in type;
};
function parseIntersectionDef(def, refs) {
    const allOf = [
        (0, parseDef_js_1.parseDef)(def.left._def, {
            ...refs,
            currentPath: [
                ...refs.currentPath,
                "allOf",
                "0"
            ]
        }),
        (0, parseDef_js_1.parseDef)(def.right._def, {
            ...refs,
            currentPath: [
                ...refs.currentPath,
                "allOf",
                "1"
            ]
        })
    ].filter((x)=>!!x);
    let unevaluatedProperties = refs.target === "jsonSchema2019-09" ? {
        unevaluatedProperties: false
    } : undefined;
    const mergedAllOf = [];
    // If either of the schemas is an allOf, merge them into a single allOf
    allOf.forEach((schema)=>{
        if (isJsonSchema7AllOfType(schema)) {
            mergedAllOf.push(...schema.allOf);
            if (schema.unevaluatedProperties === undefined) {
                // If one of the schemas has no unevaluatedProperties set,
                // the merged schema should also have no unevaluatedProperties set
                unevaluatedProperties = undefined;
            }
        } else {
            let nestedSchema = schema;
            if ("additionalProperties" in schema && schema.additionalProperties === false) {
                const { additionalProperties, ...rest } = schema;
                nestedSchema = rest;
            } else {
                // As soon as one of the schemas has additionalProperties set not to false, we allow unevaluatedProperties
                unevaluatedProperties = undefined;
            }
            mergedAllOf.push(nestedSchema);
        }
    });
    return mergedAllOf.length ? {
        allOf: mergedAllOf,
        ...unevaluatedProperties
    } : undefined;
}
exports.parseIntersectionDef = parseIntersectionDef;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/literal.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseLiteralDef = void 0;
function parseLiteralDef(def, refs) {
    const parsedType = typeof def.value;
    if (parsedType !== "bigint" && parsedType !== "number" && parsedType !== "boolean" && parsedType !== "string") {
        return {
            type: Array.isArray(def.value) ? "array" : "object"
        };
    }
    if (refs.target === "openApi3") {
        return {
            type: parsedType === "bigint" ? "integer" : parsedType,
            enum: [
                def.value
            ]
        };
    }
    return {
        type: parsedType === "bigint" ? "integer" : parsedType,
        const: def.value
    };
}
exports.parseLiteralDef = parseLiteralDef;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/string.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseStringDef = exports.zodPatterns = void 0;
const errorMessages_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/errorMessages.js [instrumentation] (ecmascript)");
let emojiRegex = undefined;
/**
 * Generated from the regular expressions found here as of 2024-05-22:
 * https://github.com/colinhacks/zod/blob/master/src/types.ts.
 *
 * Expressions with /i flag have been changed accordingly.
 */ exports.zodPatterns = {
    /**
     * `c` was changed to `[cC]` to replicate /i flag
     */ cuid: /^[cC][^\s-]{8,}$/,
    cuid2: /^[0-9a-z]+$/,
    ulid: /^[0-9A-HJKMNP-TV-Z]{26}$/,
    /**
     * `a-z` was added to replicate /i flag
     */ email: /^(?!\.)(?!.*\.\.)([a-zA-Z0-9_'+\-\.]*)[a-zA-Z0-9_+-]@([a-zA-Z0-9][a-zA-Z0-9\-]*\.)+[a-zA-Z]{2,}$/,
    /**
     * Constructed a valid Unicode RegExp
     *
     * Lazily instantiate since this type of regex isn't supported
     * in all envs (e.g. React Native).
     *
     * See:
     * https://github.com/colinhacks/zod/issues/2433
     * Fix in Zod:
     * https://github.com/colinhacks/zod/commit/9340fd51e48576a75adc919bff65dbc4a5d4c99b
     */ emoji: ()=>{
        if (emojiRegex === undefined) {
            emojiRegex = RegExp("^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$", "u");
        }
        return emojiRegex;
    },
    /**
     * Unused
     */ uuid: /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/,
    /**
     * Unused
     */ ipv4: /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/,
    ipv4Cidr: /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/,
    /**
     * Unused
     */ ipv6: /^(([a-f0-9]{1,4}:){7}|::([a-f0-9]{1,4}:){0,6}|([a-f0-9]{1,4}:){1}:([a-f0-9]{1,4}:){0,5}|([a-f0-9]{1,4}:){2}:([a-f0-9]{1,4}:){0,4}|([a-f0-9]{1,4}:){3}:([a-f0-9]{1,4}:){0,3}|([a-f0-9]{1,4}:){4}:([a-f0-9]{1,4}:){0,2}|([a-f0-9]{1,4}:){5}:([a-f0-9]{1,4}:){0,1})([a-f0-9]{1,4}|(((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2}))\.){3}((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2})))$/,
    ipv6Cidr: /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/,
    base64: /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/,
    base64url: /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/,
    nanoid: /^[a-zA-Z0-9_-]{21}$/,
    jwt: /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/
};
function parseStringDef(def, refs) {
    const res = {
        type: "string"
    };
    if (def.checks) {
        for (const check of def.checks){
            switch(check.kind){
                case "min":
                    (0, errorMessages_js_1.setResponseValueAndErrors)(res, "minLength", typeof res.minLength === "number" ? Math.max(res.minLength, check.value) : check.value, check.message, refs);
                    break;
                case "max":
                    (0, errorMessages_js_1.setResponseValueAndErrors)(res, "maxLength", typeof res.maxLength === "number" ? Math.min(res.maxLength, check.value) : check.value, check.message, refs);
                    break;
                case "email":
                    switch(refs.emailStrategy){
                        case "format:email":
                            addFormat(res, "email", check.message, refs);
                            break;
                        case "format:idn-email":
                            addFormat(res, "idn-email", check.message, refs);
                            break;
                        case "pattern:zod":
                            addPattern(res, exports.zodPatterns.email, check.message, refs);
                            break;
                    }
                    break;
                case "url":
                    addFormat(res, "uri", check.message, refs);
                    break;
                case "uuid":
                    addFormat(res, "uuid", check.message, refs);
                    break;
                case "regex":
                    addPattern(res, check.regex, check.message, refs);
                    break;
                case "cuid":
                    addPattern(res, exports.zodPatterns.cuid, check.message, refs);
                    break;
                case "cuid2":
                    addPattern(res, exports.zodPatterns.cuid2, check.message, refs);
                    break;
                case "startsWith":
                    addPattern(res, RegExp(`^${escapeLiteralCheckValue(check.value, refs)}`), check.message, refs);
                    break;
                case "endsWith":
                    addPattern(res, RegExp(`${escapeLiteralCheckValue(check.value, refs)}$`), check.message, refs);
                    break;
                case "datetime":
                    addFormat(res, "date-time", check.message, refs);
                    break;
                case "date":
                    addFormat(res, "date", check.message, refs);
                    break;
                case "time":
                    addFormat(res, "time", check.message, refs);
                    break;
                case "duration":
                    addFormat(res, "duration", check.message, refs);
                    break;
                case "length":
                    (0, errorMessages_js_1.setResponseValueAndErrors)(res, "minLength", typeof res.minLength === "number" ? Math.max(res.minLength, check.value) : check.value, check.message, refs);
                    (0, errorMessages_js_1.setResponseValueAndErrors)(res, "maxLength", typeof res.maxLength === "number" ? Math.min(res.maxLength, check.value) : check.value, check.message, refs);
                    break;
                case "includes":
                    {
                        addPattern(res, RegExp(escapeLiteralCheckValue(check.value, refs)), check.message, refs);
                        break;
                    }
                case "ip":
                    {
                        if (check.version !== "v6") {
                            addFormat(res, "ipv4", check.message, refs);
                        }
                        if (check.version !== "v4") {
                            addFormat(res, "ipv6", check.message, refs);
                        }
                        break;
                    }
                case "base64url":
                    addPattern(res, exports.zodPatterns.base64url, check.message, refs);
                    break;
                case "jwt":
                    addPattern(res, exports.zodPatterns.jwt, check.message, refs);
                    break;
                case "cidr":
                    {
                        if (check.version !== "v6") {
                            addPattern(res, exports.zodPatterns.ipv4Cidr, check.message, refs);
                        }
                        if (check.version !== "v4") {
                            addPattern(res, exports.zodPatterns.ipv6Cidr, check.message, refs);
                        }
                        break;
                    }
                case "emoji":
                    addPattern(res, exports.zodPatterns.emoji(), check.message, refs);
                    break;
                case "ulid":
                    {
                        addPattern(res, exports.zodPatterns.ulid, check.message, refs);
                        break;
                    }
                case "base64":
                    {
                        switch(refs.base64Strategy){
                            case "format:binary":
                                {
                                    addFormat(res, "binary", check.message, refs);
                                    break;
                                }
                            case "contentEncoding:base64":
                                {
                                    (0, errorMessages_js_1.setResponseValueAndErrors)(res, "contentEncoding", "base64", check.message, refs);
                                    break;
                                }
                            case "pattern:zod":
                                {
                                    addPattern(res, exports.zodPatterns.base64, check.message, refs);
                                    break;
                                }
                        }
                        break;
                    }
                case "nanoid":
                    {
                        addPattern(res, exports.zodPatterns.nanoid, check.message, refs);
                    }
                case "toLowerCase":
                case "toUpperCase":
                case "trim":
                    break;
                default:
                    ((_)=>{})(check);
            }
        }
    }
    return res;
}
exports.parseStringDef = parseStringDef;
function escapeLiteralCheckValue(literal, refs) {
    return refs.patternStrategy === "escape" ? escapeNonAlphaNumeric(literal) : literal;
}
const ALPHA_NUMERIC = new Set("ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvxyz0123456789");
function escapeNonAlphaNumeric(source) {
    let result = "";
    for(let i = 0; i < source.length; i++){
        if (!ALPHA_NUMERIC.has(source[i])) {
            result += "\\";
        }
        result += source[i];
    }
    return result;
}
// Adds a "format" keyword to the schema. If a format exists, both formats will be joined in an allOf-node, along with subsequent ones.
function addFormat(schema, value, message, refs) {
    if (schema.format || schema.anyOf?.some((x)=>x.format)) {
        if (!schema.anyOf) {
            schema.anyOf = [];
        }
        if (schema.format) {
            schema.anyOf.push({
                format: schema.format,
                ...schema.errorMessage && refs.errorMessages && {
                    errorMessage: {
                        format: schema.errorMessage.format
                    }
                }
            });
            delete schema.format;
            if (schema.errorMessage) {
                delete schema.errorMessage.format;
                if (Object.keys(schema.errorMessage).length === 0) {
                    delete schema.errorMessage;
                }
            }
        }
        schema.anyOf.push({
            format: value,
            ...message && refs.errorMessages && {
                errorMessage: {
                    format: message
                }
            }
        });
    } else {
        (0, errorMessages_js_1.setResponseValueAndErrors)(schema, "format", value, message, refs);
    }
}
// Adds a "pattern" keyword to the schema. If a pattern exists, both patterns will be joined in an allOf-node, along with subsequent ones.
function addPattern(schema, regex, message, refs) {
    if (schema.pattern || schema.allOf?.some((x)=>x.pattern)) {
        if (!schema.allOf) {
            schema.allOf = [];
        }
        if (schema.pattern) {
            schema.allOf.push({
                pattern: schema.pattern,
                ...schema.errorMessage && refs.errorMessages && {
                    errorMessage: {
                        pattern: schema.errorMessage.pattern
                    }
                }
            });
            delete schema.pattern;
            if (schema.errorMessage) {
                delete schema.errorMessage.pattern;
                if (Object.keys(schema.errorMessage).length === 0) {
                    delete schema.errorMessage;
                }
            }
        }
        schema.allOf.push({
            pattern: stringifyRegExpWithFlags(regex, refs),
            ...message && refs.errorMessages && {
                errorMessage: {
                    pattern: message
                }
            }
        });
    } else {
        (0, errorMessages_js_1.setResponseValueAndErrors)(schema, "pattern", stringifyRegExpWithFlags(regex, refs), message, refs);
    }
}
// Mutate z.string.regex() in a best attempt to accommodate for regex flags when applyRegexFlags is true
function stringifyRegExpWithFlags(regex, refs) {
    if (!refs.applyRegexFlags || !regex.flags) {
        return regex.source;
    }
    // Currently handled flags
    const flags = {
        i: regex.flags.includes("i"),
        m: regex.flags.includes("m"),
        s: regex.flags.includes("s")
    };
    // The general principle here is to step through each character, one at a time, applying mutations as flags require. We keep track when the current character is escaped, and when it's inside a group /like [this]/ or (also) a range like /[a-z]/. The following is fairly brittle imperative code; edit at your peril!
    const source = flags.i ? regex.source.toLowerCase() : regex.source;
    let pattern = "";
    let isEscaped = false;
    let inCharGroup = false;
    let inCharRange = false;
    for(let i = 0; i < source.length; i++){
        if (isEscaped) {
            pattern += source[i];
            isEscaped = false;
            continue;
        }
        if (flags.i) {
            if (inCharGroup) {
                if (source[i].match(/[a-z]/)) {
                    if (inCharRange) {
                        pattern += source[i];
                        pattern += `${source[i - 2]}-${source[i]}`.toUpperCase();
                        inCharRange = false;
                    } else if (source[i + 1] === "-" && source[i + 2]?.match(/[a-z]/)) {
                        pattern += source[i];
                        inCharRange = true;
                    } else {
                        pattern += `${source[i]}${source[i].toUpperCase()}`;
                    }
                    continue;
                }
            } else if (source[i].match(/[a-z]/)) {
                pattern += `[${source[i]}${source[i].toUpperCase()}]`;
                continue;
            }
        }
        if (flags.m) {
            if (source[i] === "^") {
                pattern += `(^|(?<=[\r\n]))`;
                continue;
            } else if (source[i] === "$") {
                pattern += `($|(?=[\r\n]))`;
                continue;
            }
        }
        if (flags.s && source[i] === ".") {
            pattern += inCharGroup ? `${source[i]}\r\n` : `[${source[i]}\r\n]`;
            continue;
        }
        pattern += source[i];
        if (source[i] === "\\") {
            isEscaped = true;
        } else if (inCharGroup && source[i] === "]") {
            inCharGroup = false;
        } else if (!inCharGroup && source[i] === "[") {
            inCharGroup = true;
        }
    }
    try {
        new RegExp(pattern);
    } catch  {
        console.warn(`Could not convert regex pattern at ${refs.currentPath.join("/")} to a flag-independent form! Falling back to the flag-ignorant source`);
        return regex.source;
    }
    return pattern;
}
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/record.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseRecordDef = void 0;
const v3_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/index.cjs [instrumentation] (ecmascript)");
const parseDef_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parseDef.js [instrumentation] (ecmascript)");
const string_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/string.js [instrumentation] (ecmascript)");
const branded_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/branded.js [instrumentation] (ecmascript)");
const any_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/any.js [instrumentation] (ecmascript)");
function parseRecordDef(def, refs) {
    if (refs.target === "openAi") {
        console.warn("Warning: OpenAI may not support records in schemas! Try an array of key-value pairs instead.");
    }
    if (refs.target === "openApi3" && def.keyType?._def.typeName === v3_1.ZodFirstPartyTypeKind.ZodEnum) {
        return {
            type: "object",
            required: def.keyType._def.values,
            properties: def.keyType._def.values.reduce((acc, key)=>({
                    ...acc,
                    [key]: (0, parseDef_js_1.parseDef)(def.valueType._def, {
                        ...refs,
                        currentPath: [
                            ...refs.currentPath,
                            "properties",
                            key
                        ]
                    }) ?? (0, any_js_1.parseAnyDef)(refs)
                }), {}),
            additionalProperties: refs.rejectedAdditionalProperties
        };
    }
    const schema = {
        type: "object",
        additionalProperties: (0, parseDef_js_1.parseDef)(def.valueType._def, {
            ...refs,
            currentPath: [
                ...refs.currentPath,
                "additionalProperties"
            ]
        }) ?? refs.allowedAdditionalProperties
    };
    if (refs.target === "openApi3") {
        return schema;
    }
    if (def.keyType?._def.typeName === v3_1.ZodFirstPartyTypeKind.ZodString && def.keyType._def.checks?.length) {
        const { type, ...keyType } = (0, string_js_1.parseStringDef)(def.keyType._def, refs);
        return {
            ...schema,
            propertyNames: keyType
        };
    } else if (def.keyType?._def.typeName === v3_1.ZodFirstPartyTypeKind.ZodEnum) {
        return {
            ...schema,
            propertyNames: {
                enum: def.keyType._def.values
            }
        };
    } else if (def.keyType?._def.typeName === v3_1.ZodFirstPartyTypeKind.ZodBranded && def.keyType._def.type._def.typeName === v3_1.ZodFirstPartyTypeKind.ZodString && def.keyType._def.type._def.checks?.length) {
        const { type, ...keyType } = (0, branded_js_1.parseBrandedDef)(def.keyType._def, refs);
        return {
            ...schema,
            propertyNames: keyType
        };
    }
    return schema;
}
exports.parseRecordDef = parseRecordDef;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/map.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseMapDef = void 0;
const parseDef_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parseDef.js [instrumentation] (ecmascript)");
const record_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/record.js [instrumentation] (ecmascript)");
const any_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/any.js [instrumentation] (ecmascript)");
function parseMapDef(def, refs) {
    if (refs.mapStrategy === "record") {
        return (0, record_js_1.parseRecordDef)(def, refs);
    }
    const keys = (0, parseDef_js_1.parseDef)(def.keyType._def, {
        ...refs,
        currentPath: [
            ...refs.currentPath,
            "items",
            "items",
            "0"
        ]
    }) || (0, any_js_1.parseAnyDef)(refs);
    const values = (0, parseDef_js_1.parseDef)(def.valueType._def, {
        ...refs,
        currentPath: [
            ...refs.currentPath,
            "items",
            "items",
            "1"
        ]
    }) || (0, any_js_1.parseAnyDef)(refs);
    return {
        type: "array",
        maxItems: 125,
        items: {
            type: "array",
            items: [
                keys,
                values
            ],
            minItems: 2,
            maxItems: 2
        }
    };
}
exports.parseMapDef = parseMapDef;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/nativeEnum.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseNativeEnumDef = void 0;
function parseNativeEnumDef(def) {
    const object = def.values;
    const actualKeys = Object.keys(def.values).filter((key)=>{
        return typeof object[object[key]] !== "number";
    });
    const actualValues = actualKeys.map((key)=>object[key]);
    const parsedTypes = Array.from(new Set(actualValues.map((values)=>typeof values)));
    return {
        type: parsedTypes.length === 1 ? parsedTypes[0] === "string" ? "string" : "number" : [
            "string",
            "number"
        ],
        enum: actualValues
    };
}
exports.parseNativeEnumDef = parseNativeEnumDef;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/never.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseNeverDef = void 0;
const any_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/any.js [instrumentation] (ecmascript)");
function parseNeverDef(refs) {
    return refs.target === "openAi" ? undefined : {
        not: (0, any_js_1.parseAnyDef)({
            ...refs,
            currentPath: [
                ...refs.currentPath,
                "not"
            ]
        })
    };
}
exports.parseNeverDef = parseNeverDef;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/null.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseNullDef = void 0;
function parseNullDef(refs) {
    return refs.target === "openApi3" ? {
        enum: [
            "null"
        ],
        nullable: true
    } : {
        type: "null"
    };
}
exports.parseNullDef = parseNullDef;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/union.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseUnionDef = exports.primitiveMappings = void 0;
const parseDef_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parseDef.js [instrumentation] (ecmascript)");
exports.primitiveMappings = {
    ZodString: "string",
    ZodNumber: "number",
    ZodBigInt: "integer",
    ZodBoolean: "boolean",
    ZodNull: "null"
};
function parseUnionDef(def, refs) {
    if (refs.target === "openApi3") return asAnyOf(def, refs);
    const options = def.options instanceof Map ? Array.from(def.options.values()) : def.options;
    // This blocks tries to look ahead a bit to produce nicer looking schemas with type array instead of anyOf.
    if (options.every((x)=>x._def.typeName in exports.primitiveMappings && (!x._def.checks || !x._def.checks.length))) {
        // all types in union are primitive and lack checks, so might as well squash into {type: [...]}
        const types = options.reduce((types, x)=>{
            const type = exports.primitiveMappings[x._def.typeName]; //Can be safely casted due to row 43
            return type && !types.includes(type) ? [
                ...types,
                type
            ] : types;
        }, []);
        return {
            type: types.length > 1 ? types : types[0]
        };
    } else if (options.every((x)=>x._def.typeName === "ZodLiteral" && !x.description)) {
        // all options literals
        const types = options.reduce((acc, x)=>{
            const type = typeof x._def.value;
            switch(type){
                case "string":
                case "number":
                case "boolean":
                    return [
                        ...acc,
                        type
                    ];
                case "bigint":
                    return [
                        ...acc,
                        "integer"
                    ];
                case "object":
                    if (x._def.value === null) return [
                        ...acc,
                        "null"
                    ];
                case "symbol":
                case "undefined":
                case "function":
                default:
                    return acc;
            }
        }, []);
        if (types.length === options.length) {
            // all the literals are primitive, as far as null can be considered primitive
            const uniqueTypes = types.filter((x, i, a)=>a.indexOf(x) === i);
            return {
                type: uniqueTypes.length > 1 ? uniqueTypes : uniqueTypes[0],
                enum: options.reduce((acc, x)=>{
                    return acc.includes(x._def.value) ? acc : [
                        ...acc,
                        x._def.value
                    ];
                }, [])
            };
        }
    } else if (options.every((x)=>x._def.typeName === "ZodEnum")) {
        return {
            type: "string",
            enum: options.reduce((acc, x)=>[
                    ...acc,
                    ...x._def.values.filter((x)=>!acc.includes(x))
                ], [])
        };
    }
    return asAnyOf(def, refs);
}
exports.parseUnionDef = parseUnionDef;
const asAnyOf = (def, refs)=>{
    const anyOf = (def.options instanceof Map ? Array.from(def.options.values()) : def.options).map((x, i)=>(0, parseDef_js_1.parseDef)(x._def, {
            ...refs,
            currentPath: [
                ...refs.currentPath,
                "anyOf",
                `${i}`
            ]
        })).filter((x)=>!!x && (!refs.strictUnions || typeof x === "object" && Object.keys(x).length > 0));
    return anyOf.length ? {
        anyOf
    } : undefined;
};
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/nullable.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseNullableDef = void 0;
const parseDef_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parseDef.js [instrumentation] (ecmascript)");
const union_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/union.js [instrumentation] (ecmascript)");
function parseNullableDef(def, refs) {
    if ([
        "ZodString",
        "ZodNumber",
        "ZodBigInt",
        "ZodBoolean",
        "ZodNull"
    ].includes(def.innerType._def.typeName) && (!def.innerType._def.checks || !def.innerType._def.checks.length)) {
        if (refs.target === "openApi3") {
            return {
                type: union_js_1.primitiveMappings[def.innerType._def.typeName],
                nullable: true
            };
        }
        return {
            type: [
                union_js_1.primitiveMappings[def.innerType._def.typeName],
                "null"
            ]
        };
    }
    if (refs.target === "openApi3") {
        const base = (0, parseDef_js_1.parseDef)(def.innerType._def, {
            ...refs,
            currentPath: [
                ...refs.currentPath
            ]
        });
        if (base && "$ref" in base) return {
            allOf: [
                base
            ],
            nullable: true
        };
        return base && {
            ...base,
            nullable: true
        };
    }
    const base = (0, parseDef_js_1.parseDef)(def.innerType._def, {
        ...refs,
        currentPath: [
            ...refs.currentPath,
            "anyOf",
            "0"
        ]
    });
    return base && {
        anyOf: [
            base,
            {
                type: "null"
            }
        ]
    };
}
exports.parseNullableDef = parseNullableDef;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/number.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseNumberDef = void 0;
const errorMessages_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/errorMessages.js [instrumentation] (ecmascript)");
function parseNumberDef(def, refs) {
    const res = {
        type: "number"
    };
    if (!def.checks) return res;
    for (const check of def.checks){
        switch(check.kind){
            case "int":
                res.type = "integer";
                (0, errorMessages_js_1.addErrorMessage)(res, "type", check.message, refs);
                break;
            case "min":
                if (refs.target === "jsonSchema7") {
                    if (check.inclusive) {
                        (0, errorMessages_js_1.setResponseValueAndErrors)(res, "minimum", check.value, check.message, refs);
                    } else {
                        (0, errorMessages_js_1.setResponseValueAndErrors)(res, "exclusiveMinimum", check.value, check.message, refs);
                    }
                } else {
                    if (!check.inclusive) {
                        res.exclusiveMinimum = true;
                    }
                    (0, errorMessages_js_1.setResponseValueAndErrors)(res, "minimum", check.value, check.message, refs);
                }
                break;
            case "max":
                if (refs.target === "jsonSchema7") {
                    if (check.inclusive) {
                        (0, errorMessages_js_1.setResponseValueAndErrors)(res, "maximum", check.value, check.message, refs);
                    } else {
                        (0, errorMessages_js_1.setResponseValueAndErrors)(res, "exclusiveMaximum", check.value, check.message, refs);
                    }
                } else {
                    if (!check.inclusive) {
                        res.exclusiveMaximum = true;
                    }
                    (0, errorMessages_js_1.setResponseValueAndErrors)(res, "maximum", check.value, check.message, refs);
                }
                break;
            case "multipleOf":
                (0, errorMessages_js_1.setResponseValueAndErrors)(res, "multipleOf", check.value, check.message, refs);
                break;
        }
    }
    return res;
}
exports.parseNumberDef = parseNumberDef;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/object.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseObjectDef = void 0;
const parseDef_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parseDef.js [instrumentation] (ecmascript)");
function parseObjectDef(def, refs) {
    const forceOptionalIntoNullable = refs.target === "openAi";
    const result = {
        type: "object",
        properties: {}
    };
    const required = [];
    const shape = def.shape();
    for(const propName in shape){
        let propDef = shape[propName];
        if (propDef === undefined || propDef._def === undefined) {
            continue;
        }
        let propOptional = safeIsOptional(propDef);
        if (propOptional && forceOptionalIntoNullable) {
            if (propDef._def.typeName === "ZodOptional") {
                propDef = propDef._def.innerType;
            }
            if (!propDef.isNullable()) {
                propDef = propDef.nullable();
            }
            propOptional = false;
        }
        const parsedDef = (0, parseDef_js_1.parseDef)(propDef._def, {
            ...refs,
            currentPath: [
                ...refs.currentPath,
                "properties",
                propName
            ],
            propertyPath: [
                ...refs.currentPath,
                "properties",
                propName
            ]
        });
        if (parsedDef === undefined) {
            continue;
        }
        result.properties[propName] = parsedDef;
        if (!propOptional) {
            required.push(propName);
        }
    }
    if (required.length) {
        result.required = required;
    }
    const additionalProperties = decideAdditionalProperties(def, refs);
    if (additionalProperties !== undefined) {
        result.additionalProperties = additionalProperties;
    }
    return result;
}
exports.parseObjectDef = parseObjectDef;
function decideAdditionalProperties(def, refs) {
    if (def.catchall._def.typeName !== "ZodNever") {
        return (0, parseDef_js_1.parseDef)(def.catchall._def, {
            ...refs,
            currentPath: [
                ...refs.currentPath,
                "additionalProperties"
            ]
        });
    }
    switch(def.unknownKeys){
        case "passthrough":
            return refs.allowedAdditionalProperties;
        case "strict":
            return refs.rejectedAdditionalProperties;
        case "strip":
            return refs.removeAdditionalStrategy === "strict" ? refs.allowedAdditionalProperties : refs.rejectedAdditionalProperties;
    }
}
function safeIsOptional(schema) {
    try {
        return schema.isOptional();
    } catch  {
        return true;
    }
}
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/optional.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseOptionalDef = void 0;
const parseDef_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parseDef.js [instrumentation] (ecmascript)");
const any_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/any.js [instrumentation] (ecmascript)");
const parseOptionalDef = (def, refs)=>{
    if (refs.currentPath.toString() === refs.propertyPath?.toString()) {
        return (0, parseDef_js_1.parseDef)(def.innerType._def, refs);
    }
    const innerSchema = (0, parseDef_js_1.parseDef)(def.innerType._def, {
        ...refs,
        currentPath: [
            ...refs.currentPath,
            "anyOf",
            "1"
        ]
    });
    return innerSchema ? {
        anyOf: [
            {
                not: (0, any_js_1.parseAnyDef)(refs)
            },
            innerSchema
        ]
    } : (0, any_js_1.parseAnyDef)(refs);
};
exports.parseOptionalDef = parseOptionalDef;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/pipeline.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parsePipelineDef = void 0;
const parseDef_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parseDef.js [instrumentation] (ecmascript)");
const parsePipelineDef = (def, refs)=>{
    if (refs.pipeStrategy === "input") {
        return (0, parseDef_js_1.parseDef)(def.in._def, refs);
    } else if (refs.pipeStrategy === "output") {
        return (0, parseDef_js_1.parseDef)(def.out._def, refs);
    }
    const a = (0, parseDef_js_1.parseDef)(def.in._def, {
        ...refs,
        currentPath: [
            ...refs.currentPath,
            "allOf",
            "0"
        ]
    });
    const b = (0, parseDef_js_1.parseDef)(def.out._def, {
        ...refs,
        currentPath: [
            ...refs.currentPath,
            "allOf",
            a ? "1" : "0"
        ]
    });
    return {
        allOf: [
            a,
            b
        ].filter((x)=>x !== undefined)
    };
};
exports.parsePipelineDef = parsePipelineDef;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/promise.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parsePromiseDef = void 0;
const parseDef_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parseDef.js [instrumentation] (ecmascript)");
function parsePromiseDef(def, refs) {
    return (0, parseDef_js_1.parseDef)(def.type._def, refs);
}
exports.parsePromiseDef = parsePromiseDef;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/set.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseSetDef = void 0;
const errorMessages_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/errorMessages.js [instrumentation] (ecmascript)");
const parseDef_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parseDef.js [instrumentation] (ecmascript)");
function parseSetDef(def, refs) {
    const items = (0, parseDef_js_1.parseDef)(def.valueType._def, {
        ...refs,
        currentPath: [
            ...refs.currentPath,
            "items"
        ]
    });
    const schema = {
        type: "array",
        uniqueItems: true,
        items
    };
    if (def.minSize) {
        (0, errorMessages_js_1.setResponseValueAndErrors)(schema, "minItems", def.minSize.value, def.minSize.message, refs);
    }
    if (def.maxSize) {
        (0, errorMessages_js_1.setResponseValueAndErrors)(schema, "maxItems", def.maxSize.value, def.maxSize.message, refs);
    }
    return schema;
}
exports.parseSetDef = parseSetDef;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/tuple.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseTupleDef = void 0;
const parseDef_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parseDef.js [instrumentation] (ecmascript)");
function parseTupleDef(def, refs) {
    if (def.rest) {
        return {
            type: "array",
            minItems: def.items.length,
            items: def.items.map((x, i)=>(0, parseDef_js_1.parseDef)(x._def, {
                    ...refs,
                    currentPath: [
                        ...refs.currentPath,
                        "items",
                        `${i}`
                    ]
                })).reduce((acc, x)=>x === undefined ? acc : [
                    ...acc,
                    x
                ], []),
            additionalItems: (0, parseDef_js_1.parseDef)(def.rest._def, {
                ...refs,
                currentPath: [
                    ...refs.currentPath,
                    "additionalItems"
                ]
            })
        };
    } else {
        return {
            type: "array",
            minItems: def.items.length,
            maxItems: def.items.length,
            items: def.items.map((x, i)=>(0, parseDef_js_1.parseDef)(x._def, {
                    ...refs,
                    currentPath: [
                        ...refs.currentPath,
                        "items",
                        `${i}`
                    ]
                })).reduce((acc, x)=>x === undefined ? acc : [
                    ...acc,
                    x
                ], [])
        };
    }
}
exports.parseTupleDef = parseTupleDef;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/undefined.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseUndefinedDef = void 0;
const any_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/any.js [instrumentation] (ecmascript)");
function parseUndefinedDef(refs) {
    return {
        not: (0, any_js_1.parseAnyDef)(refs)
    };
}
exports.parseUndefinedDef = parseUndefinedDef;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/unknown.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseUnknownDef = void 0;
const any_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/any.js [instrumentation] (ecmascript)");
function parseUnknownDef(refs) {
    return (0, any_js_1.parseAnyDef)(refs);
}
exports.parseUnknownDef = parseUnknownDef;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/readonly.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseReadonlyDef = void 0;
const parseDef_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parseDef.js [instrumentation] (ecmascript)");
const parseReadonlyDef = (def, refs)=>{
    return (0, parseDef_js_1.parseDef)(def.innerType._def, refs);
};
exports.parseReadonlyDef = parseReadonlyDef;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/selectParser.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.selectParser = void 0;
const v3_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/index.cjs [instrumentation] (ecmascript)");
const any_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/any.js [instrumentation] (ecmascript)");
const array_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/array.js [instrumentation] (ecmascript)");
const bigint_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/bigint.js [instrumentation] (ecmascript)");
const boolean_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/boolean.js [instrumentation] (ecmascript)");
const branded_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/branded.js [instrumentation] (ecmascript)");
const catch_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/catch.js [instrumentation] (ecmascript)");
const date_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/date.js [instrumentation] (ecmascript)");
const default_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/default.js [instrumentation] (ecmascript)");
const effects_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/effects.js [instrumentation] (ecmascript)");
const enum_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/enum.js [instrumentation] (ecmascript)");
const intersection_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/intersection.js [instrumentation] (ecmascript)");
const literal_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/literal.js [instrumentation] (ecmascript)");
const map_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/map.js [instrumentation] (ecmascript)");
const nativeEnum_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/nativeEnum.js [instrumentation] (ecmascript)");
const never_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/never.js [instrumentation] (ecmascript)");
const null_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/null.js [instrumentation] (ecmascript)");
const nullable_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/nullable.js [instrumentation] (ecmascript)");
const number_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/number.js [instrumentation] (ecmascript)");
const object_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/object.js [instrumentation] (ecmascript)");
const optional_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/optional.js [instrumentation] (ecmascript)");
const pipeline_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/pipeline.js [instrumentation] (ecmascript)");
const promise_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/promise.js [instrumentation] (ecmascript)");
const record_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/record.js [instrumentation] (ecmascript)");
const set_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/set.js [instrumentation] (ecmascript)");
const string_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/string.js [instrumentation] (ecmascript)");
const tuple_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/tuple.js [instrumentation] (ecmascript)");
const undefined_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/undefined.js [instrumentation] (ecmascript)");
const union_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/union.js [instrumentation] (ecmascript)");
const unknown_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/unknown.js [instrumentation] (ecmascript)");
const readonly_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/readonly.js [instrumentation] (ecmascript)");
const selectParser = (def, typeName, refs)=>{
    switch(typeName){
        case v3_1.ZodFirstPartyTypeKind.ZodString:
            return (0, string_js_1.parseStringDef)(def, refs);
        case v3_1.ZodFirstPartyTypeKind.ZodNumber:
            return (0, number_js_1.parseNumberDef)(def, refs);
        case v3_1.ZodFirstPartyTypeKind.ZodObject:
            return (0, object_js_1.parseObjectDef)(def, refs);
        case v3_1.ZodFirstPartyTypeKind.ZodBigInt:
            return (0, bigint_js_1.parseBigintDef)(def, refs);
        case v3_1.ZodFirstPartyTypeKind.ZodBoolean:
            return (0, boolean_js_1.parseBooleanDef)();
        case v3_1.ZodFirstPartyTypeKind.ZodDate:
            return (0, date_js_1.parseDateDef)(def, refs);
        case v3_1.ZodFirstPartyTypeKind.ZodUndefined:
            return (0, undefined_js_1.parseUndefinedDef)(refs);
        case v3_1.ZodFirstPartyTypeKind.ZodNull:
            return (0, null_js_1.parseNullDef)(refs);
        case v3_1.ZodFirstPartyTypeKind.ZodArray:
            return (0, array_js_1.parseArrayDef)(def, refs);
        case v3_1.ZodFirstPartyTypeKind.ZodUnion:
        case v3_1.ZodFirstPartyTypeKind.ZodDiscriminatedUnion:
            return (0, union_js_1.parseUnionDef)(def, refs);
        case v3_1.ZodFirstPartyTypeKind.ZodIntersection:
            return (0, intersection_js_1.parseIntersectionDef)(def, refs);
        case v3_1.ZodFirstPartyTypeKind.ZodTuple:
            return (0, tuple_js_1.parseTupleDef)(def, refs);
        case v3_1.ZodFirstPartyTypeKind.ZodRecord:
            return (0, record_js_1.parseRecordDef)(def, refs);
        case v3_1.ZodFirstPartyTypeKind.ZodLiteral:
            return (0, literal_js_1.parseLiteralDef)(def, refs);
        case v3_1.ZodFirstPartyTypeKind.ZodEnum:
            return (0, enum_js_1.parseEnumDef)(def);
        case v3_1.ZodFirstPartyTypeKind.ZodNativeEnum:
            return (0, nativeEnum_js_1.parseNativeEnumDef)(def);
        case v3_1.ZodFirstPartyTypeKind.ZodNullable:
            return (0, nullable_js_1.parseNullableDef)(def, refs);
        case v3_1.ZodFirstPartyTypeKind.ZodOptional:
            return (0, optional_js_1.parseOptionalDef)(def, refs);
        case v3_1.ZodFirstPartyTypeKind.ZodMap:
            return (0, map_js_1.parseMapDef)(def, refs);
        case v3_1.ZodFirstPartyTypeKind.ZodSet:
            return (0, set_js_1.parseSetDef)(def, refs);
        case v3_1.ZodFirstPartyTypeKind.ZodLazy:
            return ()=>def.getter()._def;
        case v3_1.ZodFirstPartyTypeKind.ZodPromise:
            return (0, promise_js_1.parsePromiseDef)(def, refs);
        case v3_1.ZodFirstPartyTypeKind.ZodNaN:
        case v3_1.ZodFirstPartyTypeKind.ZodNever:
            return (0, never_js_1.parseNeverDef)(refs);
        case v3_1.ZodFirstPartyTypeKind.ZodEffects:
            return (0, effects_js_1.parseEffectsDef)(def, refs);
        case v3_1.ZodFirstPartyTypeKind.ZodAny:
            return (0, any_js_1.parseAnyDef)(refs);
        case v3_1.ZodFirstPartyTypeKind.ZodUnknown:
            return (0, unknown_js_1.parseUnknownDef)(refs);
        case v3_1.ZodFirstPartyTypeKind.ZodDefault:
            return (0, default_js_1.parseDefaultDef)(def, refs);
        case v3_1.ZodFirstPartyTypeKind.ZodBranded:
            return (0, branded_js_1.parseBrandedDef)(def, refs);
        case v3_1.ZodFirstPartyTypeKind.ZodReadonly:
            return (0, readonly_js_1.parseReadonlyDef)(def, refs);
        case v3_1.ZodFirstPartyTypeKind.ZodCatch:
            return (0, catch_js_1.parseCatchDef)(def, refs);
        case v3_1.ZodFirstPartyTypeKind.ZodPipeline:
            return (0, pipeline_js_1.parsePipelineDef)(def, refs);
        case v3_1.ZodFirstPartyTypeKind.ZodFunction:
        case v3_1.ZodFirstPartyTypeKind.ZodVoid:
        case v3_1.ZodFirstPartyTypeKind.ZodSymbol:
            return undefined;
        default:
            return ((_)=>undefined)(typeName);
    }
};
exports.selectParser = selectParser;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parseDef.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseDef = void 0;
const Options_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/Options.js [instrumentation] (ecmascript)");
const selectParser_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/selectParser.js [instrumentation] (ecmascript)");
const getRelativePath_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/getRelativePath.js [instrumentation] (ecmascript)");
const any_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/any.js [instrumentation] (ecmascript)");
function parseDef(def, refs, forceResolution = false) {
    const seenItem = refs.seen.get(def);
    if (refs.override) {
        const overrideResult = refs.override?.(def, refs, seenItem, forceResolution);
        if (overrideResult !== Options_js_1.ignoreOverride) {
            return overrideResult;
        }
    }
    if (seenItem && !forceResolution) {
        const seenSchema = get$ref(seenItem, refs);
        if (seenSchema !== undefined) {
            return seenSchema;
        }
    }
    const newItem = {
        def,
        path: refs.currentPath,
        jsonSchema: undefined
    };
    refs.seen.set(def, newItem);
    const jsonSchemaOrGetter = (0, selectParser_js_1.selectParser)(def, def.typeName, refs);
    // If the return was a function, then the inner definition needs to be extracted before a call to parseDef (recursive)
    const jsonSchema = typeof jsonSchemaOrGetter === "function" ? parseDef(jsonSchemaOrGetter(), refs) : jsonSchemaOrGetter;
    if (jsonSchema) {
        addMeta(def, refs, jsonSchema);
    }
    if (refs.postProcess) {
        const postProcessResult = refs.postProcess(jsonSchema, def, refs);
        newItem.jsonSchema = jsonSchema;
        return postProcessResult;
    }
    newItem.jsonSchema = jsonSchema;
    return jsonSchema;
}
exports.parseDef = parseDef;
const get$ref = (item, refs)=>{
    switch(refs.$refStrategy){
        case "root":
            return {
                $ref: item.path.join("/")
            };
        case "relative":
            return {
                $ref: (0, getRelativePath_js_1.getRelativePath)(refs.currentPath, item.path)
            };
        case "none":
        case "seen":
            {
                if (item.path.length < refs.currentPath.length && item.path.every((value, index)=>refs.currentPath[index] === value)) {
                    console.warn(`Recursive reference detected at ${refs.currentPath.join("/")}! Defaulting to any`);
                    return (0, any_js_1.parseAnyDef)(refs);
                }
                return refs.$refStrategy === "seen" ? (0, any_js_1.parseAnyDef)(refs) : undefined;
            }
    }
};
const addMeta = (def, refs, jsonSchema)=>{
    if (def.description) {
        jsonSchema.description = def.description;
        if (refs.markdownDescription) {
            jsonSchema.markdownDescription = def.description;
        }
    }
    return jsonSchema;
};
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parseTypes.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/zodToJsonSchema.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.zodToJsonSchema = void 0;
const parseDef_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parseDef.js [instrumentation] (ecmascript)");
const Refs_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/Refs.js [instrumentation] (ecmascript)");
const any_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/any.js [instrumentation] (ecmascript)");
const zodToJsonSchema = (schema, options)=>{
    const refs = (0, Refs_js_1.getRefs)(options);
    let definitions = typeof options === "object" && options.definitions ? Object.entries(options.definitions).reduce((acc, [name, schema])=>({
            ...acc,
            [name]: (0, parseDef_js_1.parseDef)(schema._def, {
                ...refs,
                currentPath: [
                    ...refs.basePath,
                    refs.definitionPath,
                    name
                ]
            }, true) ?? (0, any_js_1.parseAnyDef)(refs)
        }), {}) : undefined;
    const name = typeof options === "string" ? options : options?.nameStrategy === "title" ? undefined : options?.name;
    const main = (0, parseDef_js_1.parseDef)(schema._def, name === undefined ? refs : {
        ...refs,
        currentPath: [
            ...refs.basePath,
            refs.definitionPath,
            name
        ]
    }, false) ?? (0, any_js_1.parseAnyDef)(refs);
    const title = typeof options === "object" && options.name !== undefined && options.nameStrategy === "title" ? options.name : undefined;
    if (title !== undefined) {
        main.title = title;
    }
    if (refs.flags.hasReferencedOpenAiAnyType) {
        if (!definitions) {
            definitions = {};
        }
        if (!definitions[refs.openAiAnyTypeName]) {
            definitions[refs.openAiAnyTypeName] = {
                // Skipping "object" as no properties can be defined and additionalProperties must be "false"
                type: [
                    "string",
                    "number",
                    "integer",
                    "boolean",
                    "array",
                    "null"
                ],
                items: {
                    $ref: refs.$refStrategy === "relative" ? "1" : [
                        ...refs.basePath,
                        refs.definitionPath,
                        refs.openAiAnyTypeName
                    ].join("/")
                }
            };
        }
    }
    const combined = name === undefined ? definitions ? {
        ...main,
        [refs.definitionPath]: definitions
    } : main : {
        $ref: [
            ...refs.$refStrategy === "relative" ? [] : refs.basePath,
            refs.definitionPath,
            name
        ].join("/"),
        [refs.definitionPath]: {
            ...definitions,
            [name]: main
        }
    };
    if (refs.target === "jsonSchema7") {
        combined.$schema = "http://json-schema.org/draft-07/schema#";
    } else if (refs.target === "jsonSchema2019-09" || refs.target === "openAi") {
        combined.$schema = "https://json-schema.org/draft/2019-09/schema#";
    }
    if (refs.target === "openAi" && ("anyOf" in combined || "oneOf" in combined || "allOf" in combined || "type" in combined && Array.isArray(combined.type))) {
        console.warn("Warning: OpenAI may not support schemas with unions as roots! Try wrapping it in an object property.");
    }
    return combined;
};
exports.zodToJsonSchema = zodToJsonSchema;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/index.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var __createBinding = /*TURBOPACK member replacement*/ __turbopack_context__.e && /*TURBOPACK member replacement*/ __turbopack_context__.e.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = {
            enumerable: true,
            get: function() {
                return m[k];
            }
        };
    }
    Object.defineProperty(o, k2, desc);
} : function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
});
var __exportStar = /*TURBOPACK member replacement*/ __turbopack_context__.e && /*TURBOPACK member replacement*/ __turbopack_context__.e.__exportStar || function(m, exports1) {
    for(var p in m)if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports1, p)) __createBinding(exports1, m, p);
};
Object.defineProperty(exports, "__esModule", {
    value: true
});
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/Options.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/Refs.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/errorMessages.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/getRelativePath.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parseDef.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parseTypes.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/any.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/array.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/bigint.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/boolean.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/branded.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/catch.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/date.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/default.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/effects.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/enum.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/intersection.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/literal.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/map.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/nativeEnum.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/never.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/null.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/nullable.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/number.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/object.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/optional.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/pipeline.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/promise.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/readonly.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/record.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/set.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/string.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/tuple.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/undefined.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/union.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/parsers/unknown.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/selectParser.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/zodToJsonSchema.js [instrumentation] (ecmascript)"), exports);
const zodToJsonSchema_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-to-json-schema@3.25.2_zod@3.25.76/node_modules/zod-to-json-schema/dist/cjs/zodToJsonSchema.js [instrumentation] (ecmascript)");
exports.default = zodToJsonSchema_js_1.zodToJsonSchema;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/p-map@7.0.4/node_modules/p-map/index.js [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>pMap,
    "pMapIterable",
    ()=>pMapIterable,
    "pMapSkip",
    ()=>pMapSkip
]);
async function pMap(iterable, mapper, { concurrency = Number.POSITIVE_INFINITY, stopOnError = true, signal } = {}) {
    return new Promise((resolve_, reject_)=>{
        if (iterable[Symbol.iterator] === undefined && iterable[Symbol.asyncIterator] === undefined) {
            throw new TypeError(`Expected \`input\` to be either an \`Iterable\` or \`AsyncIterable\`, got (${typeof iterable})`);
        }
        if (typeof mapper !== 'function') {
            throw new TypeError('Mapper function is required');
        }
        if (!(Number.isSafeInteger(concurrency) && concurrency >= 1 || concurrency === Number.POSITIVE_INFINITY)) {
            throw new TypeError(`Expected \`concurrency\` to be an integer from 1 and up or \`Infinity\`, got \`${concurrency}\` (${typeof concurrency})`);
        }
        const result = [];
        const errors = [];
        const skippedIndexesMap = new Map();
        let isRejected = false;
        let isResolved = false;
        let isIterableDone = false;
        let resolvingCount = 0;
        let currentIndex = 0;
        const iterator = iterable[Symbol.iterator] === undefined ? iterable[Symbol.asyncIterator]() : iterable[Symbol.iterator]();
        const signalListener = ()=>{
            reject(signal.reason);
        };
        const cleanup = ()=>{
            signal?.removeEventListener('abort', signalListener);
        };
        const resolve = (value)=>{
            resolve_(value);
            cleanup();
        };
        const reject = (reason)=>{
            isRejected = true;
            isResolved = true;
            reject_(reason);
            cleanup();
        };
        if (signal) {
            if (signal.aborted) {
                reject(signal.reason);
            }
            signal.addEventListener('abort', signalListener, {
                once: true
            });
        }
        const next = async ()=>{
            if (isResolved) {
                return;
            }
            const nextItem = await iterator.next();
            const index = currentIndex;
            currentIndex++;
            // Note: `iterator.next()` can be called many times in parallel.
            // This can cause multiple calls to this `next()` function to
            // receive a `nextItem` with `done === true`.
            // The shutdown logic that rejects/resolves must be protected
            // so it runs only one time as the `skippedIndex` logic is
            // non-idempotent.
            if (nextItem.done) {
                isIterableDone = true;
                if (resolvingCount === 0 && !isResolved) {
                    if (!stopOnError && errors.length > 0) {
                        reject(new AggregateError(errors)); // eslint-disable-line unicorn/error-message
                        return;
                    }
                    isResolved = true;
                    if (skippedIndexesMap.size === 0) {
                        resolve(result);
                        return;
                    }
                    const pureResult = [];
                    // Support multiple `pMapSkip`'s.
                    for (const [index, value] of result.entries()){
                        if (skippedIndexesMap.get(index) === pMapSkip) {
                            continue;
                        }
                        pureResult.push(value);
                    }
                    resolve(pureResult);
                }
                return;
            }
            resolvingCount++;
            // Intentionally detached
            (async ()=>{
                try {
                    const element = await nextItem.value;
                    if (isResolved) {
                        return;
                    }
                    const value = await mapper(element, index);
                    // Use Map to stage the index of the element.
                    if (value === pMapSkip) {
                        skippedIndexesMap.set(index, value);
                    }
                    result[index] = value;
                    resolvingCount--;
                    await next();
                } catch (error) {
                    if (stopOnError) {
                        reject(error);
                    } else {
                        errors.push(error);
                        resolvingCount--;
                        // In that case we can't really continue regardless of `stopOnError` state
                        // since an iterable is likely to continue throwing after it throws once.
                        // If we continue calling `next()` indefinitely we will likely end up
                        // in an infinite loop of failed iteration.
                        try {
                            await next();
                        } catch (error) {
                            reject(error);
                        }
                    }
                }
            })();
        };
        // Create the concurrent runners in a detached (non-awaited)
        // promise. We need this so we can await the `next()` calls
        // to stop creating runners before hitting the concurrency limit
        // if the iterable has already been marked as done.
        // NOTE: We *must* do this for async iterators otherwise we'll spin up
        // infinite `next()` calls by default and never start the event loop.
        (async ()=>{
            for(let index = 0; index < concurrency; index++){
                try {
                    // eslint-disable-next-line no-await-in-loop
                    await next();
                } catch (error) {
                    reject(error);
                    break;
                }
                if (isIterableDone || isRejected) {
                    break;
                }
            }
        })();
    });
}
function pMapIterable(iterable, mapper, { concurrency = Number.POSITIVE_INFINITY, backpressure = concurrency } = {}) {
    if (iterable[Symbol.iterator] === undefined && iterable[Symbol.asyncIterator] === undefined) {
        throw new TypeError(`Expected \`input\` to be either an \`Iterable\` or \`AsyncIterable\`, got (${typeof iterable})`);
    }
    if (typeof mapper !== 'function') {
        throw new TypeError('Mapper function is required');
    }
    if (!(Number.isSafeInteger(concurrency) && concurrency >= 1 || concurrency === Number.POSITIVE_INFINITY)) {
        throw new TypeError(`Expected \`concurrency\` to be an integer from 1 and up or \`Infinity\`, got \`${concurrency}\` (${typeof concurrency})`);
    }
    if (!(Number.isSafeInteger(backpressure) && backpressure >= concurrency || backpressure === Number.POSITIVE_INFINITY)) {
        throw new TypeError(`Expected \`backpressure\` to be an integer from \`concurrency\` (${concurrency}) and up or \`Infinity\`, got \`${backpressure}\` (${typeof backpressure})`);
    }
    return {
        async *[Symbol.asyncIterator] () {
            const iterator = iterable[Symbol.asyncIterator] === undefined ? iterable[Symbol.iterator]() : iterable[Symbol.asyncIterator]();
            const promises = [];
            let pendingPromisesCount = 0;
            let isDone = false;
            let index = 0;
            function trySpawn() {
                if (isDone || !(pendingPromisesCount < concurrency && promises.length < backpressure)) {
                    return;
                }
                pendingPromisesCount++;
                const promise = (async ()=>{
                    const { done, value } = await iterator.next();
                    if (done) {
                        pendingPromisesCount--;
                        return {
                            done: true
                        };
                    }
                    // Spawn if still below concurrency and backpressure limit
                    trySpawn();
                    try {
                        const returnValue = await mapper(await value, index++);
                        pendingPromisesCount--;
                        if (returnValue === pMapSkip) {
                            const index = promises.indexOf(promise);
                            if (index > 0) {
                                promises.splice(index, 1);
                            }
                        }
                        // Spawn if still below backpressure limit and just dropped below concurrency limit
                        trySpawn();
                        return {
                            done: false,
                            value: returnValue
                        };
                    } catch (error) {
                        pendingPromisesCount--;
                        isDone = true;
                        return {
                            error
                        };
                    }
                })();
                promises.push(promise);
            }
            trySpawn();
            while(promises.length > 0){
                const { error, done, value } = await promises[0]; // eslint-disable-line no-await-in-loop
                promises.shift();
                if (error) {
                    throw error;
                }
                if (done) {
                    return;
                }
                // Spawn if just dropped below backpressure limit and below the concurrency limit
                trySpawn();
                if (value === pMapSkip) {
                    continue;
                }
                yield value;
            }
        }
    };
}
const pMapSkip = Symbol('skip');
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/picomatch@4.0.4/node_modules/picomatch/lib/constants.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

const WIN_SLASH = '\\\\/';
const WIN_NO_SLASH = `[^${WIN_SLASH}]`;
const DEFAULT_MAX_EXTGLOB_RECURSION = 0;
/**
 * Posix glob regex
 */ const DOT_LITERAL = '\\.';
const PLUS_LITERAL = '\\+';
const QMARK_LITERAL = '\\?';
const SLASH_LITERAL = '\\/';
const ONE_CHAR = '(?=.)';
const QMARK = '[^/]';
const END_ANCHOR = `(?:${SLASH_LITERAL}|$)`;
const START_ANCHOR = `(?:^|${SLASH_LITERAL})`;
const DOTS_SLASH = `${DOT_LITERAL}{1,2}${END_ANCHOR}`;
const NO_DOT = `(?!${DOT_LITERAL})`;
const NO_DOTS = `(?!${START_ANCHOR}${DOTS_SLASH})`;
const NO_DOT_SLASH = `(?!${DOT_LITERAL}{0,1}${END_ANCHOR})`;
const NO_DOTS_SLASH = `(?!${DOTS_SLASH})`;
const QMARK_NO_DOT = `[^.${SLASH_LITERAL}]`;
const STAR = `${QMARK}*?`;
const SEP = '/';
const POSIX_CHARS = {
    DOT_LITERAL,
    PLUS_LITERAL,
    QMARK_LITERAL,
    SLASH_LITERAL,
    ONE_CHAR,
    QMARK,
    END_ANCHOR,
    DOTS_SLASH,
    NO_DOT,
    NO_DOTS,
    NO_DOT_SLASH,
    NO_DOTS_SLASH,
    QMARK_NO_DOT,
    STAR,
    START_ANCHOR,
    SEP
};
/**
 * Windows glob regex
 */ const WINDOWS_CHARS = {
    ...POSIX_CHARS,
    SLASH_LITERAL: `[${WIN_SLASH}]`,
    QMARK: WIN_NO_SLASH,
    STAR: `${WIN_NO_SLASH}*?`,
    DOTS_SLASH: `${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$)`,
    NO_DOT: `(?!${DOT_LITERAL})`,
    NO_DOTS: `(?!(?:^|[${WIN_SLASH}])${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$))`,
    NO_DOT_SLASH: `(?!${DOT_LITERAL}{0,1}(?:[${WIN_SLASH}]|$))`,
    NO_DOTS_SLASH: `(?!${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$))`,
    QMARK_NO_DOT: `[^.${WIN_SLASH}]`,
    START_ANCHOR: `(?:^|[${WIN_SLASH}])`,
    END_ANCHOR: `(?:[${WIN_SLASH}]|$)`,
    SEP: '\\'
};
/**
 * POSIX Bracket Regex
 */ const POSIX_REGEX_SOURCE = {
    __proto__: null,
    alnum: 'a-zA-Z0-9',
    alpha: 'a-zA-Z',
    ascii: '\\x00-\\x7F',
    blank: ' \\t',
    cntrl: '\\x00-\\x1F\\x7F',
    digit: '0-9',
    graph: '\\x21-\\x7E',
    lower: 'a-z',
    print: '\\x20-\\x7E ',
    punct: '\\-!"#$%&\'()\\*+,./:;<=>?@[\\]^_`{|}~',
    space: ' \\t\\r\\n\\v\\f',
    upper: 'A-Z',
    word: 'A-Za-z0-9_',
    xdigit: 'A-Fa-f0-9'
};
module.exports = {
    DEFAULT_MAX_EXTGLOB_RECURSION,
    MAX_LENGTH: 1024 * 64,
    POSIX_REGEX_SOURCE,
    // regular expressions
    REGEX_BACKSLASH: /\\(?![*+?^${}(|)[\]])/g,
    REGEX_NON_SPECIAL_CHARS: /^[^@![\].,$*+?^{}()|\\/]+/,
    REGEX_SPECIAL_CHARS: /[-*+?.^${}(|)[\]]/,
    REGEX_SPECIAL_CHARS_BACKREF: /(\\?)((\W)(\3*))/g,
    REGEX_SPECIAL_CHARS_GLOBAL: /([-*+?.^${}(|)[\]])/g,
    REGEX_REMOVE_BACKSLASH: /(?:\[.*?[^\\]\]|\\(?=.))/g,
    // Replace globs with equivalent patterns to reduce parsing time.
    REPLACEMENTS: {
        __proto__: null,
        '***': '*',
        '**/**': '**',
        '**/**/**': '**'
    },
    // Digits
    CHAR_0: 48,
    /* 0 */ CHAR_9: 57,
    /* 9 */ // Alphabet chars.
    CHAR_UPPERCASE_A: 65,
    /* A */ CHAR_LOWERCASE_A: 97,
    /* a */ CHAR_UPPERCASE_Z: 90,
    /* Z */ CHAR_LOWERCASE_Z: 122,
    /* z */ CHAR_LEFT_PARENTHESES: 40,
    /* ( */ CHAR_RIGHT_PARENTHESES: 41,
    /* ) */ CHAR_ASTERISK: 42,
    /* * */ // Non-alphabetic chars.
    CHAR_AMPERSAND: 38,
    /* & */ CHAR_AT: 64,
    /* @ */ CHAR_BACKWARD_SLASH: 92,
    /* \ */ CHAR_CARRIAGE_RETURN: 13,
    /* \r */ CHAR_CIRCUMFLEX_ACCENT: 94,
    /* ^ */ CHAR_COLON: 58,
    /* : */ CHAR_COMMA: 44,
    /* , */ CHAR_DOT: 46,
    /* . */ CHAR_DOUBLE_QUOTE: 34,
    /* " */ CHAR_EQUAL: 61,
    /* = */ CHAR_EXCLAMATION_MARK: 33,
    /* ! */ CHAR_FORM_FEED: 12,
    /* \f */ CHAR_FORWARD_SLASH: 47,
    /* / */ CHAR_GRAVE_ACCENT: 96,
    /* ` */ CHAR_HASH: 35,
    /* # */ CHAR_HYPHEN_MINUS: 45,
    /* - */ CHAR_LEFT_ANGLE_BRACKET: 60,
    /* < */ CHAR_LEFT_CURLY_BRACE: 123,
    /* { */ CHAR_LEFT_SQUARE_BRACKET: 91,
    /* [ */ CHAR_LINE_FEED: 10,
    /* \n */ CHAR_NO_BREAK_SPACE: 160,
    /* \u00A0 */ CHAR_PERCENT: 37,
    /* % */ CHAR_PLUS: 43,
    /* + */ CHAR_QUESTION_MARK: 63,
    /* ? */ CHAR_RIGHT_ANGLE_BRACKET: 62,
    /* > */ CHAR_RIGHT_CURLY_BRACE: 125,
    /* } */ CHAR_RIGHT_SQUARE_BRACKET: 93,
    /* ] */ CHAR_SEMICOLON: 59,
    /* ; */ CHAR_SINGLE_QUOTE: 39,
    /* ' */ CHAR_SPACE: 32,
    /*   */ CHAR_TAB: 9,
    /* \t */ CHAR_UNDERSCORE: 95,
    /* _ */ CHAR_VERTICAL_LINE: 124,
    /* | */ CHAR_ZERO_WIDTH_NOBREAK_SPACE: 65279,
    /* \uFEFF */ /**
   * Create EXTGLOB_CHARS
   */ extglobChars (chars) {
        return {
            '!': {
                type: 'negate',
                open: '(?:(?!(?:',
                close: `))${chars.STAR})`
            },
            '?': {
                type: 'qmark',
                open: '(?:',
                close: ')?'
            },
            '+': {
                type: 'plus',
                open: '(?:',
                close: ')+'
            },
            '*': {
                type: 'star',
                open: '(?:',
                close: ')*'
            },
            '@': {
                type: 'at',
                open: '(?:',
                close: ')'
            }
        };
    },
    /**
   * Create GLOB_CHARS
   */ globChars (win32) {
        return win32 === true ? WINDOWS_CHARS : POSIX_CHARS;
    }
};
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/picomatch@4.0.4/node_modules/picomatch/lib/utils.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

/*global navigator*/ const { REGEX_BACKSLASH, REGEX_REMOVE_BACKSLASH, REGEX_SPECIAL_CHARS, REGEX_SPECIAL_CHARS_GLOBAL } = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/picomatch@4.0.4/node_modules/picomatch/lib/constants.js [instrumentation] (ecmascript)");
exports.isObject = (val)=>val !== null && typeof val === 'object' && !Array.isArray(val);
exports.hasRegexChars = (str)=>REGEX_SPECIAL_CHARS.test(str);
exports.isRegexChar = (str)=>str.length === 1 && exports.hasRegexChars(str);
exports.escapeRegex = (str)=>str.replace(REGEX_SPECIAL_CHARS_GLOBAL, '\\$1');
exports.toPosixSlashes = (str)=>str.replace(REGEX_BACKSLASH, '/');
exports.isWindows = ()=>{
    if (typeof navigator !== 'undefined' && navigator.platform) {
        const platform = navigator.platform.toLowerCase();
        return platform === 'win32' || platform === 'windows';
    }
    if (typeof process !== 'undefined' && process.platform) {
        return process.platform === 'win32';
    }
    return false;
};
exports.removeBackslashes = (str)=>{
    return str.replace(REGEX_REMOVE_BACKSLASH, (match)=>{
        return match === '\\' ? '' : match;
    });
};
exports.escapeLast = (input, char, lastIdx)=>{
    const idx = input.lastIndexOf(char, lastIdx);
    if (idx === -1) return input;
    if (input[idx - 1] === '\\') return exports.escapeLast(input, char, idx - 1);
    return `${input.slice(0, idx)}\\${input.slice(idx)}`;
};
exports.removePrefix = (input, state = {})=>{
    let output = input;
    if (output.startsWith('./')) {
        output = output.slice(2);
        state.prefix = './';
    }
    return output;
};
exports.wrapOutput = (input, state = {}, options = {})=>{
    const prepend = options.contains ? '' : '^';
    const append = options.contains ? '' : '$';
    let output = `${prepend}(?:${input})${append}`;
    if (state.negated === true) {
        output = `(?:^(?!${output}).*$)`;
    }
    return output;
};
exports.basename = (path, { windows } = {})=>{
    const segs = path.split(windows ? /[\\/]/ : '/');
    const last = segs[segs.length - 1];
    if (last === '') {
        return segs[segs.length - 2];
    }
    return last;
};
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/picomatch@4.0.4/node_modules/picomatch/lib/scan.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

const utils = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/picomatch@4.0.4/node_modules/picomatch/lib/utils.js [instrumentation] (ecmascript)");
const { CHAR_ASTERISK, /* * */ CHAR_AT, /* @ */ CHAR_BACKWARD_SLASH, /* \ */ CHAR_COMMA, /* , */ CHAR_DOT, /* . */ CHAR_EXCLAMATION_MARK, /* ! */ CHAR_FORWARD_SLASH, /* / */ CHAR_LEFT_CURLY_BRACE, /* { */ CHAR_LEFT_PARENTHESES, /* ( */ CHAR_LEFT_SQUARE_BRACKET, /* [ */ CHAR_PLUS, /* + */ CHAR_QUESTION_MARK, /* ? */ CHAR_RIGHT_CURLY_BRACE, /* } */ CHAR_RIGHT_PARENTHESES, /* ) */ CHAR_RIGHT_SQUARE_BRACKET/* ] */  } = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/picomatch@4.0.4/node_modules/picomatch/lib/constants.js [instrumentation] (ecmascript)");
const isPathSeparator = (code)=>{
    return code === CHAR_FORWARD_SLASH || code === CHAR_BACKWARD_SLASH;
};
const depth = (token)=>{
    if (token.isPrefix !== true) {
        token.depth = token.isGlobstar ? Infinity : 1;
    }
};
/**
 * Quickly scans a glob pattern and returns an object with a handful of
 * useful properties, like `isGlob`, `path` (the leading non-glob, if it exists),
 * `glob` (the actual pattern), `negated` (true if the path starts with `!` but not
 * with `!(`) and `negatedExtglob` (true if the path starts with `!(`).
 *
 * ```js
 * const pm = require('picomatch');
 * console.log(pm.scan('foo/bar/*.js'));
 * { isGlob: true, input: 'foo/bar/*.js', base: 'foo/bar', glob: '*.js' }
 * ```
 * @param {String} `str`
 * @param {Object} `options`
 * @return {Object} Returns an object with tokens and regex source string.
 * @api public
 */ const scan = (input, options)=>{
    const opts = options || {};
    const length = input.length - 1;
    const scanToEnd = opts.parts === true || opts.scanToEnd === true;
    const slashes = [];
    const tokens = [];
    const parts = [];
    let str = input;
    let index = -1;
    let start = 0;
    let lastIndex = 0;
    let isBrace = false;
    let isBracket = false;
    let isGlob = false;
    let isExtglob = false;
    let isGlobstar = false;
    let braceEscaped = false;
    let backslashes = false;
    let negated = false;
    let negatedExtglob = false;
    let finished = false;
    let braces = 0;
    let prev;
    let code;
    let token = {
        value: '',
        depth: 0,
        isGlob: false
    };
    const eos = ()=>index >= length;
    const peek = ()=>str.charCodeAt(index + 1);
    const advance = ()=>{
        prev = code;
        return str.charCodeAt(++index);
    };
    while(index < length){
        code = advance();
        let next;
        if (code === CHAR_BACKWARD_SLASH) {
            backslashes = token.backslashes = true;
            code = advance();
            if (code === CHAR_LEFT_CURLY_BRACE) {
                braceEscaped = true;
            }
            continue;
        }
        if (braceEscaped === true || code === CHAR_LEFT_CURLY_BRACE) {
            braces++;
            while(eos() !== true && (code = advance())){
                if (code === CHAR_BACKWARD_SLASH) {
                    backslashes = token.backslashes = true;
                    advance();
                    continue;
                }
                if (code === CHAR_LEFT_CURLY_BRACE) {
                    braces++;
                    continue;
                }
                if (braceEscaped !== true && code === CHAR_DOT && (code = advance()) === CHAR_DOT) {
                    isBrace = token.isBrace = true;
                    isGlob = token.isGlob = true;
                    finished = true;
                    if (scanToEnd === true) {
                        continue;
                    }
                    break;
                }
                if (braceEscaped !== true && code === CHAR_COMMA) {
                    isBrace = token.isBrace = true;
                    isGlob = token.isGlob = true;
                    finished = true;
                    if (scanToEnd === true) {
                        continue;
                    }
                    break;
                }
                if (code === CHAR_RIGHT_CURLY_BRACE) {
                    braces--;
                    if (braces === 0) {
                        braceEscaped = false;
                        isBrace = token.isBrace = true;
                        finished = true;
                        break;
                    }
                }
            }
            if (scanToEnd === true) {
                continue;
            }
            break;
        }
        if (code === CHAR_FORWARD_SLASH) {
            slashes.push(index);
            tokens.push(token);
            token = {
                value: '',
                depth: 0,
                isGlob: false
            };
            if (finished === true) continue;
            if (prev === CHAR_DOT && index === start + 1) {
                start += 2;
                continue;
            }
            lastIndex = index + 1;
            continue;
        }
        if (opts.noext !== true) {
            const isExtglobChar = code === CHAR_PLUS || code === CHAR_AT || code === CHAR_ASTERISK || code === CHAR_QUESTION_MARK || code === CHAR_EXCLAMATION_MARK;
            if (isExtglobChar === true && peek() === CHAR_LEFT_PARENTHESES) {
                isGlob = token.isGlob = true;
                isExtglob = token.isExtglob = true;
                finished = true;
                if (code === CHAR_EXCLAMATION_MARK && index === start) {
                    negatedExtglob = true;
                }
                if (scanToEnd === true) {
                    while(eos() !== true && (code = advance())){
                        if (code === CHAR_BACKWARD_SLASH) {
                            backslashes = token.backslashes = true;
                            code = advance();
                            continue;
                        }
                        if (code === CHAR_RIGHT_PARENTHESES) {
                            isGlob = token.isGlob = true;
                            finished = true;
                            break;
                        }
                    }
                    continue;
                }
                break;
            }
        }
        if (code === CHAR_ASTERISK) {
            if (prev === CHAR_ASTERISK) isGlobstar = token.isGlobstar = true;
            isGlob = token.isGlob = true;
            finished = true;
            if (scanToEnd === true) {
                continue;
            }
            break;
        }
        if (code === CHAR_QUESTION_MARK) {
            isGlob = token.isGlob = true;
            finished = true;
            if (scanToEnd === true) {
                continue;
            }
            break;
        }
        if (code === CHAR_LEFT_SQUARE_BRACKET) {
            while(eos() !== true && (next = advance())){
                if (next === CHAR_BACKWARD_SLASH) {
                    backslashes = token.backslashes = true;
                    advance();
                    continue;
                }
                if (next === CHAR_RIGHT_SQUARE_BRACKET) {
                    isBracket = token.isBracket = true;
                    isGlob = token.isGlob = true;
                    finished = true;
                    break;
                }
            }
            if (scanToEnd === true) {
                continue;
            }
            break;
        }
        if (opts.nonegate !== true && code === CHAR_EXCLAMATION_MARK && index === start) {
            negated = token.negated = true;
            start++;
            continue;
        }
        if (opts.noparen !== true && code === CHAR_LEFT_PARENTHESES) {
            isGlob = token.isGlob = true;
            if (scanToEnd === true) {
                while(eos() !== true && (code = advance())){
                    if (code === CHAR_LEFT_PARENTHESES) {
                        backslashes = token.backslashes = true;
                        code = advance();
                        continue;
                    }
                    if (code === CHAR_RIGHT_PARENTHESES) {
                        finished = true;
                        break;
                    }
                }
                continue;
            }
            break;
        }
        if (isGlob === true) {
            finished = true;
            if (scanToEnd === true) {
                continue;
            }
            break;
        }
    }
    if (opts.noext === true) {
        isExtglob = false;
        isGlob = false;
    }
    let base = str;
    let prefix = '';
    let glob = '';
    if (start > 0) {
        prefix = str.slice(0, start);
        str = str.slice(start);
        lastIndex -= start;
    }
    if (base && isGlob === true && lastIndex > 0) {
        base = str.slice(0, lastIndex);
        glob = str.slice(lastIndex);
    } else if (isGlob === true) {
        base = '';
        glob = str;
    } else {
        base = str;
    }
    if (base && base !== '' && base !== '/' && base !== str) {
        if (isPathSeparator(base.charCodeAt(base.length - 1))) {
            base = base.slice(0, -1);
        }
    }
    if (opts.unescape === true) {
        if (glob) glob = utils.removeBackslashes(glob);
        if (base && backslashes === true) {
            base = utils.removeBackslashes(base);
        }
    }
    const state = {
        prefix,
        input,
        start,
        base,
        glob,
        isBrace,
        isBracket,
        isGlob,
        isExtglob,
        isGlobstar,
        negated,
        negatedExtglob
    };
    if (opts.tokens === true) {
        state.maxDepth = 0;
        if (!isPathSeparator(code)) {
            tokens.push(token);
        }
        state.tokens = tokens;
    }
    if (opts.parts === true || opts.tokens === true) {
        let prevIndex;
        for(let idx = 0; idx < slashes.length; idx++){
            const n = prevIndex ? prevIndex + 1 : start;
            const i = slashes[idx];
            const value = input.slice(n, i);
            if (opts.tokens) {
                if (idx === 0 && start !== 0) {
                    tokens[idx].isPrefix = true;
                    tokens[idx].value = prefix;
                } else {
                    tokens[idx].value = value;
                }
                depth(tokens[idx]);
                state.maxDepth += tokens[idx].depth;
            }
            if (idx !== 0 || value !== '') {
                parts.push(value);
            }
            prevIndex = i;
        }
        if (prevIndex && prevIndex + 1 < input.length) {
            const value = input.slice(prevIndex + 1);
            parts.push(value);
            if (opts.tokens) {
                tokens[tokens.length - 1].value = value;
                depth(tokens[tokens.length - 1]);
                state.maxDepth += tokens[tokens.length - 1].depth;
            }
        }
        state.slashes = slashes;
        state.parts = parts;
    }
    return state;
};
module.exports = scan;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/picomatch@4.0.4/node_modules/picomatch/lib/parse.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

const constants = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/picomatch@4.0.4/node_modules/picomatch/lib/constants.js [instrumentation] (ecmascript)");
const utils = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/picomatch@4.0.4/node_modules/picomatch/lib/utils.js [instrumentation] (ecmascript)");
/**
 * Constants
 */ const { MAX_LENGTH, POSIX_REGEX_SOURCE, REGEX_NON_SPECIAL_CHARS, REGEX_SPECIAL_CHARS_BACKREF, REPLACEMENTS } = constants;
/**
 * Helpers
 */ const expandRange = (args, options)=>{
    if (typeof options.expandRange === 'function') {
        return options.expandRange(...args, options);
    }
    args.sort();
    const value = `[${args.join('-')}]`;
    try {
        /* eslint-disable-next-line no-new */ new RegExp(value);
    } catch (ex) {
        return args.map((v)=>utils.escapeRegex(v)).join('..');
    }
    return value;
};
/**
 * Create the message for a syntax error
 */ const syntaxError = (type, char)=>{
    return `Missing ${type}: "${char}" - use "\\\\${char}" to match literal characters`;
};
const splitTopLevel = (input)=>{
    const parts = [];
    let bracket = 0;
    let paren = 0;
    let quote = 0;
    let value = '';
    let escaped = false;
    for (const ch of input){
        if (escaped === true) {
            value += ch;
            escaped = false;
            continue;
        }
        if (ch === '\\') {
            value += ch;
            escaped = true;
            continue;
        }
        if (ch === '"') {
            quote = quote === 1 ? 0 : 1;
            value += ch;
            continue;
        }
        if (quote === 0) {
            if (ch === '[') {
                bracket++;
            } else if (ch === ']' && bracket > 0) {
                bracket--;
            } else if (bracket === 0) {
                if (ch === '(') {
                    paren++;
                } else if (ch === ')' && paren > 0) {
                    paren--;
                } else if (ch === '|' && paren === 0) {
                    parts.push(value);
                    value = '';
                    continue;
                }
            }
        }
        value += ch;
    }
    parts.push(value);
    return parts;
};
const isPlainBranch = (branch)=>{
    let escaped = false;
    for (const ch of branch){
        if (escaped === true) {
            escaped = false;
            continue;
        }
        if (ch === '\\') {
            escaped = true;
            continue;
        }
        if (/[?*+@!()[\]{}]/.test(ch)) {
            return false;
        }
    }
    return true;
};
const normalizeSimpleBranch = (branch)=>{
    let value = branch.trim();
    let changed = true;
    while(changed === true){
        changed = false;
        if (/^@\([^\\()[\]{}|]+\)$/.test(value)) {
            value = value.slice(2, -1);
            changed = true;
        }
    }
    if (!isPlainBranch(value)) {
        return;
    }
    return value.replace(/\\(.)/g, '$1');
};
const hasRepeatedCharPrefixOverlap = (branches)=>{
    const values = branches.map(normalizeSimpleBranch).filter(Boolean);
    for(let i = 0; i < values.length; i++){
        for(let j = i + 1; j < values.length; j++){
            const a = values[i];
            const b = values[j];
            const char = a[0];
            if (!char || a !== char.repeat(a.length) || b !== char.repeat(b.length)) {
                continue;
            }
            if (a === b || a.startsWith(b) || b.startsWith(a)) {
                return true;
            }
        }
    }
    return false;
};
const parseRepeatedExtglob = (pattern, requireEnd = true)=>{
    if (pattern[0] !== '+' && pattern[0] !== '*' || pattern[1] !== '(') {
        return;
    }
    let bracket = 0;
    let paren = 0;
    let quote = 0;
    let escaped = false;
    for(let i = 1; i < pattern.length; i++){
        const ch = pattern[i];
        if (escaped === true) {
            escaped = false;
            continue;
        }
        if (ch === '\\') {
            escaped = true;
            continue;
        }
        if (ch === '"') {
            quote = quote === 1 ? 0 : 1;
            continue;
        }
        if (quote === 1) {
            continue;
        }
        if (ch === '[') {
            bracket++;
            continue;
        }
        if (ch === ']' && bracket > 0) {
            bracket--;
            continue;
        }
        if (bracket > 0) {
            continue;
        }
        if (ch === '(') {
            paren++;
            continue;
        }
        if (ch === ')') {
            paren--;
            if (paren === 0) {
                if (requireEnd === true && i !== pattern.length - 1) {
                    return;
                }
                return {
                    type: pattern[0],
                    body: pattern.slice(2, i),
                    end: i
                };
            }
        }
    }
};
const getStarExtglobSequenceOutput = (pattern)=>{
    let index = 0;
    const chars = [];
    while(index < pattern.length){
        const match = parseRepeatedExtglob(pattern.slice(index), false);
        if (!match || match.type !== '*') {
            return;
        }
        const branches = splitTopLevel(match.body).map((branch)=>branch.trim());
        if (branches.length !== 1) {
            return;
        }
        const branch = normalizeSimpleBranch(branches[0]);
        if (!branch || branch.length !== 1) {
            return;
        }
        chars.push(branch);
        index += match.end + 1;
    }
    if (chars.length < 1) {
        return;
    }
    const source = chars.length === 1 ? utils.escapeRegex(chars[0]) : `[${chars.map((ch)=>utils.escapeRegex(ch)).join('')}]`;
    return `${source}*`;
};
const repeatedExtglobRecursion = (pattern)=>{
    let depth = 0;
    let value = pattern.trim();
    let match = parseRepeatedExtglob(value);
    while(match){
        depth++;
        value = match.body.trim();
        match = parseRepeatedExtglob(value);
    }
    return depth;
};
const analyzeRepeatedExtglob = (body, options)=>{
    if (options.maxExtglobRecursion === false) {
        return {
            risky: false
        };
    }
    const max = typeof options.maxExtglobRecursion === 'number' ? options.maxExtglobRecursion : constants.DEFAULT_MAX_EXTGLOB_RECURSION;
    const branches = splitTopLevel(body).map((branch)=>branch.trim());
    if (branches.length > 1) {
        if (branches.some((branch)=>branch === '') || branches.some((branch)=>/^[*?]+$/.test(branch)) || hasRepeatedCharPrefixOverlap(branches)) {
            return {
                risky: true
            };
        }
    }
    for (const branch of branches){
        const safeOutput = getStarExtglobSequenceOutput(branch);
        if (safeOutput) {
            return {
                risky: true,
                safeOutput
            };
        }
        if (repeatedExtglobRecursion(branch) > max) {
            return {
                risky: true
            };
        }
    }
    return {
        risky: false
    };
};
/**
 * Parse the given input string.
 * @param {String} input
 * @param {Object} options
 * @return {Object}
 */ const parse = (input, options)=>{
    if (typeof input !== 'string') {
        throw new TypeError('Expected a string');
    }
    input = REPLACEMENTS[input] || input;
    const opts = {
        ...options
    };
    const max = typeof opts.maxLength === 'number' ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;
    let len = input.length;
    if (len > max) {
        throw new SyntaxError(`Input length: ${len}, exceeds maximum allowed length: ${max}`);
    }
    const bos = {
        type: 'bos',
        value: '',
        output: opts.prepend || ''
    };
    const tokens = [
        bos
    ];
    const capture = opts.capture ? '' : '?:';
    // create constants based on platform, for windows or posix
    const PLATFORM_CHARS = constants.globChars(opts.windows);
    const EXTGLOB_CHARS = constants.extglobChars(PLATFORM_CHARS);
    const { DOT_LITERAL, PLUS_LITERAL, SLASH_LITERAL, ONE_CHAR, DOTS_SLASH, NO_DOT, NO_DOT_SLASH, NO_DOTS_SLASH, QMARK, QMARK_NO_DOT, STAR, START_ANCHOR } = PLATFORM_CHARS;
    const globstar = (opts)=>{
        return `(${capture}(?:(?!${START_ANCHOR}${opts.dot ? DOTS_SLASH : DOT_LITERAL}).)*?)`;
    };
    const nodot = opts.dot ? '' : NO_DOT;
    const qmarkNoDot = opts.dot ? QMARK : QMARK_NO_DOT;
    let star = opts.bash === true ? globstar(opts) : STAR;
    if (opts.capture) {
        star = `(${star})`;
    }
    // minimatch options support
    if (typeof opts.noext === 'boolean') {
        opts.noextglob = opts.noext;
    }
    const state = {
        input,
        index: -1,
        start: 0,
        dot: opts.dot === true,
        consumed: '',
        output: '',
        prefix: '',
        backtrack: false,
        negated: false,
        brackets: 0,
        braces: 0,
        parens: 0,
        quotes: 0,
        globstar: false,
        tokens
    };
    input = utils.removePrefix(input, state);
    len = input.length;
    const extglobs = [];
    const braces = [];
    const stack = [];
    let prev = bos;
    let value;
    /**
   * Tokenizing helpers
   */ const eos = ()=>state.index === len - 1;
    const peek = state.peek = (n = 1)=>input[state.index + n];
    const advance = state.advance = ()=>input[++state.index] || '';
    const remaining = ()=>input.slice(state.index + 1);
    const consume = (value = '', num = 0)=>{
        state.consumed += value;
        state.index += num;
    };
    const append = (token)=>{
        state.output += token.output != null ? token.output : token.value;
        consume(token.value);
    };
    const negate = ()=>{
        let count = 1;
        while(peek() === '!' && (peek(2) !== '(' || peek(3) === '?')){
            advance();
            state.start++;
            count++;
        }
        if (count % 2 === 0) {
            return false;
        }
        state.negated = true;
        state.start++;
        return true;
    };
    const increment = (type)=>{
        state[type]++;
        stack.push(type);
    };
    const decrement = (type)=>{
        state[type]--;
        stack.pop();
    };
    /**
   * Push tokens onto the tokens array. This helper speeds up
   * tokenizing by 1) helping us avoid backtracking as much as possible,
   * and 2) helping us avoid creating extra tokens when consecutive
   * characters are plain text. This improves performance and simplifies
   * lookbehinds.
   */ const push = (tok)=>{
        if (prev.type === 'globstar') {
            const isBrace = state.braces > 0 && (tok.type === 'comma' || tok.type === 'brace');
            const isExtglob = tok.extglob === true || extglobs.length && (tok.type === 'pipe' || tok.type === 'paren');
            if (tok.type !== 'slash' && tok.type !== 'paren' && !isBrace && !isExtglob) {
                state.output = state.output.slice(0, -prev.output.length);
                prev.type = 'star';
                prev.value = '*';
                prev.output = star;
                state.output += prev.output;
            }
        }
        if (extglobs.length && tok.type !== 'paren') {
            extglobs[extglobs.length - 1].inner += tok.value;
        }
        if (tok.value || tok.output) append(tok);
        if (prev && prev.type === 'text' && tok.type === 'text') {
            prev.output = (prev.output || prev.value) + tok.value;
            prev.value += tok.value;
            return;
        }
        tok.prev = prev;
        tokens.push(tok);
        prev = tok;
    };
    const extglobOpen = (type, value)=>{
        const token = {
            ...EXTGLOB_CHARS[value],
            conditions: 1,
            inner: ''
        };
        token.prev = prev;
        token.parens = state.parens;
        token.output = state.output;
        token.startIndex = state.index;
        token.tokensIndex = tokens.length;
        const output = (opts.capture ? '(' : '') + token.open;
        increment('parens');
        push({
            type,
            value,
            output: state.output ? '' : ONE_CHAR
        });
        push({
            type: 'paren',
            extglob: true,
            value: advance(),
            output
        });
        extglobs.push(token);
    };
    const extglobClose = (token)=>{
        const literal = input.slice(token.startIndex, state.index + 1);
        const body = input.slice(token.startIndex + 2, state.index);
        const analysis = analyzeRepeatedExtglob(body, opts);
        if ((token.type === 'plus' || token.type === 'star') && analysis.risky) {
            const safeOutput = analysis.safeOutput ? (token.output ? '' : ONE_CHAR) + (opts.capture ? `(${analysis.safeOutput})` : analysis.safeOutput) : undefined;
            const open = tokens[token.tokensIndex];
            open.type = 'text';
            open.value = literal;
            open.output = safeOutput || utils.escapeRegex(literal);
            for(let i = token.tokensIndex + 1; i < tokens.length; i++){
                tokens[i].value = '';
                tokens[i].output = '';
                delete tokens[i].suffix;
            }
            state.output = token.output + open.output;
            state.backtrack = true;
            push({
                type: 'paren',
                extglob: true,
                value,
                output: ''
            });
            decrement('parens');
            return;
        }
        let output = token.close + (opts.capture ? ')' : '');
        let rest;
        if (token.type === 'negate') {
            let extglobStar = star;
            if (token.inner && token.inner.length > 1 && token.inner.includes('/')) {
                extglobStar = globstar(opts);
            }
            if (extglobStar !== star || eos() || /^\)+$/.test(remaining())) {
                output = token.close = `)$))${extglobStar}`;
            }
            if (token.inner.includes('*') && (rest = remaining()) && /^\.[^\\/.]+$/.test(rest)) {
                // Any non-magical string (`.ts`) or even nested expression (`.{ts,tsx}`) can follow after the closing parenthesis.
                // In this case, we need to parse the string and use it in the output of the original pattern.
                // Suitable patterns: `/!(*.d).ts`, `/!(*.d).{ts,tsx}`, `**/!(*-dbg).@(js)`.
                //
                // Disabling the `fastpaths` option due to a problem with parsing strings as `.ts` in the pattern like `**/!(*.d).ts`.
                const expression = parse(rest, {
                    ...options,
                    fastpaths: false
                }).output;
                output = token.close = `)${expression})${extglobStar})`;
            }
            if (token.prev.type === 'bos') {
                state.negatedExtglob = true;
            }
        }
        push({
            type: 'paren',
            extglob: true,
            value,
            output
        });
        decrement('parens');
    };
    /**
   * Fast paths
   */ if (opts.fastpaths !== false && !/(^[*!]|[/()[\]{}"])/.test(input)) {
        let backslashes = false;
        let output = input.replace(REGEX_SPECIAL_CHARS_BACKREF, (m, esc, chars, first, rest, index)=>{
            if (first === '\\') {
                backslashes = true;
                return m;
            }
            if (first === '?') {
                if (esc) {
                    return esc + first + (rest ? QMARK.repeat(rest.length) : '');
                }
                if (index === 0) {
                    return qmarkNoDot + (rest ? QMARK.repeat(rest.length) : '');
                }
                return QMARK.repeat(chars.length);
            }
            if (first === '.') {
                return DOT_LITERAL.repeat(chars.length);
            }
            if (first === '*') {
                if (esc) {
                    return esc + first + (rest ? star : '');
                }
                return star;
            }
            return esc ? m : `\\${m}`;
        });
        if (backslashes === true) {
            if (opts.unescape === true) {
                output = output.replace(/\\/g, '');
            } else {
                output = output.replace(/\\+/g, (m)=>{
                    return m.length % 2 === 0 ? '\\\\' : m ? '\\' : '';
                });
            }
        }
        if (output === input && opts.contains === true) {
            state.output = input;
            return state;
        }
        state.output = utils.wrapOutput(output, state, options);
        return state;
    }
    /**
   * Tokenize input until we reach end-of-string
   */ while(!eos()){
        value = advance();
        if (value === '\u0000') {
            continue;
        }
        /**
     * Escaped characters
     */ if (value === '\\') {
            const next = peek();
            if (next === '/' && opts.bash !== true) {
                continue;
            }
            if (next === '.' || next === ';') {
                continue;
            }
            if (!next) {
                value += '\\';
                push({
                    type: 'text',
                    value
                });
                continue;
            }
            // collapse slashes to reduce potential for exploits
            const match = /^\\+/.exec(remaining());
            let slashes = 0;
            if (match && match[0].length > 2) {
                slashes = match[0].length;
                state.index += slashes;
                if (slashes % 2 !== 0) {
                    value += '\\';
                }
            }
            if (opts.unescape === true) {
                value = advance();
            } else {
                value += advance();
            }
            if (state.brackets === 0) {
                push({
                    type: 'text',
                    value
                });
                continue;
            }
        }
        /**
     * If we're inside a regex character class, continue
     * until we reach the closing bracket.
     */ if (state.brackets > 0 && (value !== ']' || prev.value === '[' || prev.value === '[^')) {
            if (opts.posix !== false && value === ':') {
                const inner = prev.value.slice(1);
                if (inner.includes('[')) {
                    prev.posix = true;
                    if (inner.includes(':')) {
                        const idx = prev.value.lastIndexOf('[');
                        const pre = prev.value.slice(0, idx);
                        const rest = prev.value.slice(idx + 2);
                        const posix = POSIX_REGEX_SOURCE[rest];
                        if (posix) {
                            prev.value = pre + posix;
                            state.backtrack = true;
                            advance();
                            if (!bos.output && tokens.indexOf(prev) === 1) {
                                bos.output = ONE_CHAR;
                            }
                            continue;
                        }
                    }
                }
            }
            if (value === '[' && peek() !== ':' || value === '-' && peek() === ']') {
                value = `\\${value}`;
            }
            if (value === ']' && (prev.value === '[' || prev.value === '[^')) {
                value = `\\${value}`;
            }
            if (opts.posix === true && value === '!' && prev.value === '[') {
                value = '^';
            }
            prev.value += value;
            append({
                value
            });
            continue;
        }
        /**
     * If we're inside a quoted string, continue
     * until we reach the closing double quote.
     */ if (state.quotes === 1 && value !== '"') {
            value = utils.escapeRegex(value);
            prev.value += value;
            append({
                value
            });
            continue;
        }
        /**
     * Double quotes
     */ if (value === '"') {
            state.quotes = state.quotes === 1 ? 0 : 1;
            if (opts.keepQuotes === true) {
                push({
                    type: 'text',
                    value
                });
            }
            continue;
        }
        /**
     * Parentheses
     */ if (value === '(') {
            increment('parens');
            push({
                type: 'paren',
                value
            });
            continue;
        }
        if (value === ')') {
            if (state.parens === 0 && opts.strictBrackets === true) {
                throw new SyntaxError(syntaxError('opening', '('));
            }
            const extglob = extglobs[extglobs.length - 1];
            if (extglob && state.parens === extglob.parens + 1) {
                extglobClose(extglobs.pop());
                continue;
            }
            push({
                type: 'paren',
                value,
                output: state.parens ? ')' : '\\)'
            });
            decrement('parens');
            continue;
        }
        /**
     * Square brackets
     */ if (value === '[') {
            if (opts.nobracket === true || !remaining().includes(']')) {
                if (opts.nobracket !== true && opts.strictBrackets === true) {
                    throw new SyntaxError(syntaxError('closing', ']'));
                }
                value = `\\${value}`;
            } else {
                increment('brackets');
            }
            push({
                type: 'bracket',
                value
            });
            continue;
        }
        if (value === ']') {
            if (opts.nobracket === true || prev && prev.type === 'bracket' && prev.value.length === 1) {
                push({
                    type: 'text',
                    value,
                    output: `\\${value}`
                });
                continue;
            }
            if (state.brackets === 0) {
                if (opts.strictBrackets === true) {
                    throw new SyntaxError(syntaxError('opening', '['));
                }
                push({
                    type: 'text',
                    value,
                    output: `\\${value}`
                });
                continue;
            }
            decrement('brackets');
            const prevValue = prev.value.slice(1);
            if (prev.posix !== true && prevValue[0] === '^' && !prevValue.includes('/')) {
                value = `/${value}`;
            }
            prev.value += value;
            append({
                value
            });
            // when literal brackets are explicitly disabled
            // assume we should match with a regex character class
            if (opts.literalBrackets === false || utils.hasRegexChars(prevValue)) {
                continue;
            }
            const escaped = utils.escapeRegex(prev.value);
            state.output = state.output.slice(0, -prev.value.length);
            // when literal brackets are explicitly enabled
            // assume we should escape the brackets to match literal characters
            if (opts.literalBrackets === true) {
                state.output += escaped;
                prev.value = escaped;
                continue;
            }
            // when the user specifies nothing, try to match both
            prev.value = `(${capture}${escaped}|${prev.value})`;
            state.output += prev.value;
            continue;
        }
        /**
     * Braces
     */ if (value === '{' && opts.nobrace !== true) {
            increment('braces');
            const open = {
                type: 'brace',
                value,
                output: '(',
                outputIndex: state.output.length,
                tokensIndex: state.tokens.length
            };
            braces.push(open);
            push(open);
            continue;
        }
        if (value === '}') {
            const brace = braces[braces.length - 1];
            if (opts.nobrace === true || !brace) {
                push({
                    type: 'text',
                    value,
                    output: value
                });
                continue;
            }
            let output = ')';
            if (brace.dots === true) {
                const arr = tokens.slice();
                const range = [];
                for(let i = arr.length - 1; i >= 0; i--){
                    tokens.pop();
                    if (arr[i].type === 'brace') {
                        break;
                    }
                    if (arr[i].type !== 'dots') {
                        range.unshift(arr[i].value);
                    }
                }
                output = expandRange(range, opts);
                state.backtrack = true;
            }
            if (brace.comma !== true && brace.dots !== true) {
                const out = state.output.slice(0, brace.outputIndex);
                const toks = state.tokens.slice(brace.tokensIndex);
                brace.value = brace.output = '\\{';
                value = output = '\\}';
                state.output = out;
                for (const t of toks){
                    state.output += t.output || t.value;
                }
            }
            push({
                type: 'brace',
                value,
                output
            });
            decrement('braces');
            braces.pop();
            continue;
        }
        /**
     * Pipes
     */ if (value === '|') {
            if (extglobs.length > 0) {
                extglobs[extglobs.length - 1].conditions++;
            }
            push({
                type: 'text',
                value
            });
            continue;
        }
        /**
     * Commas
     */ if (value === ',') {
            let output = value;
            const brace = braces[braces.length - 1];
            if (brace && stack[stack.length - 1] === 'braces') {
                brace.comma = true;
                output = '|';
            }
            push({
                type: 'comma',
                value,
                output
            });
            continue;
        }
        /**
     * Slashes
     */ if (value === '/') {
            // if the beginning of the glob is "./", advance the start
            // to the current index, and don't add the "./" characters
            // to the state. This greatly simplifies lookbehinds when
            // checking for BOS characters like "!" and "." (not "./")
            if (prev.type === 'dot' && state.index === state.start + 1) {
                state.start = state.index + 1;
                state.consumed = '';
                state.output = '';
                tokens.pop();
                prev = bos; // reset "prev" to the first token
                continue;
            }
            push({
                type: 'slash',
                value,
                output: SLASH_LITERAL
            });
            continue;
        }
        /**
     * Dots
     */ if (value === '.') {
            if (state.braces > 0 && prev.type === 'dot') {
                if (prev.value === '.') prev.output = DOT_LITERAL;
                const brace = braces[braces.length - 1];
                prev.type = 'dots';
                prev.output += value;
                prev.value += value;
                brace.dots = true;
                continue;
            }
            if (state.braces + state.parens === 0 && prev.type !== 'bos' && prev.type !== 'slash') {
                push({
                    type: 'text',
                    value,
                    output: DOT_LITERAL
                });
                continue;
            }
            push({
                type: 'dot',
                value,
                output: DOT_LITERAL
            });
            continue;
        }
        /**
     * Question marks
     */ if (value === '?') {
            const isGroup = prev && prev.value === '(';
            if (!isGroup && opts.noextglob !== true && peek() === '(' && peek(2) !== '?') {
                extglobOpen('qmark', value);
                continue;
            }
            if (prev && prev.type === 'paren') {
                const next = peek();
                let output = value;
                if (prev.value === '(' && !/[!=<:]/.test(next) || next === '<' && !/<([!=]|\w+>)/.test(remaining())) {
                    output = `\\${value}`;
                }
                push({
                    type: 'text',
                    value,
                    output
                });
                continue;
            }
            if (opts.dot !== true && (prev.type === 'slash' || prev.type === 'bos')) {
                push({
                    type: 'qmark',
                    value,
                    output: QMARK_NO_DOT
                });
                continue;
            }
            push({
                type: 'qmark',
                value,
                output: QMARK
            });
            continue;
        }
        /**
     * Exclamation
     */ if (value === '!') {
            if (opts.noextglob !== true && peek() === '(') {
                if (peek(2) !== '?' || !/[!=<:]/.test(peek(3))) {
                    extglobOpen('negate', value);
                    continue;
                }
            }
            if (opts.nonegate !== true && state.index === 0) {
                negate();
                continue;
            }
        }
        /**
     * Plus
     */ if (value === '+') {
            if (opts.noextglob !== true && peek() === '(' && peek(2) !== '?') {
                extglobOpen('plus', value);
                continue;
            }
            if (prev && prev.value === '(' || opts.regex === false) {
                push({
                    type: 'plus',
                    value,
                    output: PLUS_LITERAL
                });
                continue;
            }
            if (prev && (prev.type === 'bracket' || prev.type === 'paren' || prev.type === 'brace') || state.parens > 0) {
                push({
                    type: 'plus',
                    value
                });
                continue;
            }
            push({
                type: 'plus',
                value: PLUS_LITERAL
            });
            continue;
        }
        /**
     * Plain text
     */ if (value === '@') {
            if (opts.noextglob !== true && peek() === '(' && peek(2) !== '?') {
                push({
                    type: 'at',
                    extglob: true,
                    value,
                    output: ''
                });
                continue;
            }
            push({
                type: 'text',
                value
            });
            continue;
        }
        /**
     * Plain text
     */ if (value !== '*') {
            if (value === '$' || value === '^') {
                value = `\\${value}`;
            }
            const match = REGEX_NON_SPECIAL_CHARS.exec(remaining());
            if (match) {
                value += match[0];
                state.index += match[0].length;
            }
            push({
                type: 'text',
                value
            });
            continue;
        }
        /**
     * Stars
     */ if (prev && (prev.type === 'globstar' || prev.star === true)) {
            prev.type = 'star';
            prev.star = true;
            prev.value += value;
            prev.output = star;
            state.backtrack = true;
            state.globstar = true;
            consume(value);
            continue;
        }
        let rest = remaining();
        if (opts.noextglob !== true && /^\([^?]/.test(rest)) {
            extglobOpen('star', value);
            continue;
        }
        if (prev.type === 'star') {
            if (opts.noglobstar === true) {
                consume(value);
                continue;
            }
            const prior = prev.prev;
            const before = prior.prev;
            const isStart = prior.type === 'slash' || prior.type === 'bos';
            const afterStar = before && (before.type === 'star' || before.type === 'globstar');
            if (opts.bash === true && (!isStart || rest[0] && rest[0] !== '/')) {
                push({
                    type: 'star',
                    value,
                    output: ''
                });
                continue;
            }
            const isBrace = state.braces > 0 && (prior.type === 'comma' || prior.type === 'brace');
            const isExtglob = extglobs.length && (prior.type === 'pipe' || prior.type === 'paren');
            if (!isStart && prior.type !== 'paren' && !isBrace && !isExtglob) {
                push({
                    type: 'star',
                    value,
                    output: ''
                });
                continue;
            }
            // strip consecutive `/**/`
            while(rest.slice(0, 3) === '/**'){
                const after = input[state.index + 4];
                if (after && after !== '/') {
                    break;
                }
                rest = rest.slice(3);
                consume('/**', 3);
            }
            if (prior.type === 'bos' && eos()) {
                prev.type = 'globstar';
                prev.value += value;
                prev.output = globstar(opts);
                state.output = prev.output;
                state.globstar = true;
                consume(value);
                continue;
            }
            if (prior.type === 'slash' && prior.prev.type !== 'bos' && !afterStar && eos()) {
                state.output = state.output.slice(0, -(prior.output + prev.output).length);
                prior.output = `(?:${prior.output}`;
                prev.type = 'globstar';
                prev.output = globstar(opts) + (opts.strictSlashes ? ')' : '|$)');
                prev.value += value;
                state.globstar = true;
                state.output += prior.output + prev.output;
                consume(value);
                continue;
            }
            if (prior.type === 'slash' && prior.prev.type !== 'bos' && rest[0] === '/') {
                const end = rest[1] !== void 0 ? '|$' : '';
                state.output = state.output.slice(0, -(prior.output + prev.output).length);
                prior.output = `(?:${prior.output}`;
                prev.type = 'globstar';
                prev.output = `${globstar(opts)}${SLASH_LITERAL}|${SLASH_LITERAL}${end})`;
                prev.value += value;
                state.output += prior.output + prev.output;
                state.globstar = true;
                consume(value + advance());
                push({
                    type: 'slash',
                    value: '/',
                    output: ''
                });
                continue;
            }
            if (prior.type === 'bos' && rest[0] === '/') {
                prev.type = 'globstar';
                prev.value += value;
                prev.output = `(?:^|${SLASH_LITERAL}|${globstar(opts)}${SLASH_LITERAL})`;
                state.output = prev.output;
                state.globstar = true;
                consume(value + advance());
                push({
                    type: 'slash',
                    value: '/',
                    output: ''
                });
                continue;
            }
            // remove single star from output
            state.output = state.output.slice(0, -prev.output.length);
            // reset previous token to globstar
            prev.type = 'globstar';
            prev.output = globstar(opts);
            prev.value += value;
            // reset output with globstar
            state.output += prev.output;
            state.globstar = true;
            consume(value);
            continue;
        }
        const token = {
            type: 'star',
            value,
            output: star
        };
        if (opts.bash === true) {
            token.output = '.*?';
            if (prev.type === 'bos' || prev.type === 'slash') {
                token.output = nodot + token.output;
            }
            push(token);
            continue;
        }
        if (prev && (prev.type === 'bracket' || prev.type === 'paren') && opts.regex === true) {
            token.output = value;
            push(token);
            continue;
        }
        if (state.index === state.start || prev.type === 'slash' || prev.type === 'dot') {
            if (prev.type === 'dot') {
                state.output += NO_DOT_SLASH;
                prev.output += NO_DOT_SLASH;
            } else if (opts.dot === true) {
                state.output += NO_DOTS_SLASH;
                prev.output += NO_DOTS_SLASH;
            } else {
                state.output += nodot;
                prev.output += nodot;
            }
            if (peek() !== '*') {
                state.output += ONE_CHAR;
                prev.output += ONE_CHAR;
            }
        }
        push(token);
    }
    while(state.brackets > 0){
        if (opts.strictBrackets === true) throw new SyntaxError(syntaxError('closing', ']'));
        state.output = utils.escapeLast(state.output, '[');
        decrement('brackets');
    }
    while(state.parens > 0){
        if (opts.strictBrackets === true) throw new SyntaxError(syntaxError('closing', ')'));
        state.output = utils.escapeLast(state.output, '(');
        decrement('parens');
    }
    while(state.braces > 0){
        if (opts.strictBrackets === true) throw new SyntaxError(syntaxError('closing', '}'));
        state.output = utils.escapeLast(state.output, '{');
        decrement('braces');
    }
    if (opts.strictSlashes !== true && (prev.type === 'star' || prev.type === 'bracket')) {
        push({
            type: 'maybe_slash',
            value: '',
            output: `${SLASH_LITERAL}?`
        });
    }
    // rebuild the output if we had to backtrack at any point
    if (state.backtrack === true) {
        state.output = '';
        for (const token of state.tokens){
            state.output += token.output != null ? token.output : token.value;
            if (token.suffix) {
                state.output += token.suffix;
            }
        }
    }
    return state;
};
/**
 * Fast paths for creating regular expressions for common glob patterns.
 * This can significantly speed up processing and has very little downside
 * impact when none of the fast paths match.
 */ parse.fastpaths = (input, options)=>{
    const opts = {
        ...options
    };
    const max = typeof opts.maxLength === 'number' ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;
    const len = input.length;
    if (len > max) {
        throw new SyntaxError(`Input length: ${len}, exceeds maximum allowed length: ${max}`);
    }
    input = REPLACEMENTS[input] || input;
    // create constants based on platform, for windows or posix
    const { DOT_LITERAL, SLASH_LITERAL, ONE_CHAR, DOTS_SLASH, NO_DOT, NO_DOTS, NO_DOTS_SLASH, STAR, START_ANCHOR } = constants.globChars(opts.windows);
    const nodot = opts.dot ? NO_DOTS : NO_DOT;
    const slashDot = opts.dot ? NO_DOTS_SLASH : NO_DOT;
    const capture = opts.capture ? '' : '?:';
    const state = {
        negated: false,
        prefix: ''
    };
    let star = opts.bash === true ? '.*?' : STAR;
    if (opts.capture) {
        star = `(${star})`;
    }
    const globstar = (opts)=>{
        if (opts.noglobstar === true) return star;
        return `(${capture}(?:(?!${START_ANCHOR}${opts.dot ? DOTS_SLASH : DOT_LITERAL}).)*?)`;
    };
    const create = (str)=>{
        switch(str){
            case '*':
                return `${nodot}${ONE_CHAR}${star}`;
            case '.*':
                return `${DOT_LITERAL}${ONE_CHAR}${star}`;
            case '*.*':
                return `${nodot}${star}${DOT_LITERAL}${ONE_CHAR}${star}`;
            case '*/*':
                return `${nodot}${star}${SLASH_LITERAL}${ONE_CHAR}${slashDot}${star}`;
            case '**':
                return nodot + globstar(opts);
            case '**/*':
                return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${slashDot}${ONE_CHAR}${star}`;
            case '**/*.*':
                return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${slashDot}${star}${DOT_LITERAL}${ONE_CHAR}${star}`;
            case '**/.*':
                return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${DOT_LITERAL}${ONE_CHAR}${star}`;
            default:
                {
                    const match = /^(.*?)\.(\w+)$/.exec(str);
                    if (!match) return;
                    const source = create(match[1]);
                    if (!source) return;
                    return source + DOT_LITERAL + match[2];
                }
        }
    };
    const output = utils.removePrefix(input, state);
    let source = create(output);
    if (source && opts.strictSlashes !== true) {
        source += `${SLASH_LITERAL}?`;
    }
    return source;
};
module.exports = parse;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/picomatch@4.0.4/node_modules/picomatch/lib/picomatch.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

const scan = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/picomatch@4.0.4/node_modules/picomatch/lib/scan.js [instrumentation] (ecmascript)");
const parse = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/picomatch@4.0.4/node_modules/picomatch/lib/parse.js [instrumentation] (ecmascript)");
const utils = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/picomatch@4.0.4/node_modules/picomatch/lib/utils.js [instrumentation] (ecmascript)");
const constants = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/picomatch@4.0.4/node_modules/picomatch/lib/constants.js [instrumentation] (ecmascript)");
const isObject = (val)=>val && typeof val === 'object' && !Array.isArray(val);
/**
 * Creates a matcher function from one or more glob patterns. The
 * returned function takes a string to match as its first argument,
 * and returns true if the string is a match. The returned matcher
 * function also takes a boolean as the second argument that, when true,
 * returns an object with additional information.
 *
 * ```js
 * const picomatch = require('picomatch');
 * // picomatch(glob[, options]);
 *
 * const isMatch = picomatch('*.!(*a)');
 * console.log(isMatch('a.a')); //=> false
 * console.log(isMatch('a.b')); //=> true
 * ```
 * @name picomatch
 * @param {String|Array} `globs` One or more glob patterns.
 * @param {Object=} `options`
 * @return {Function=} Returns a matcher function.
 * @api public
 */ const picomatch = (glob, options, returnState = false)=>{
    if (Array.isArray(glob)) {
        const fns = glob.map((input)=>picomatch(input, options, returnState));
        const arrayMatcher = (str)=>{
            for (const isMatch of fns){
                const state = isMatch(str);
                if (state) return state;
            }
            return false;
        };
        return arrayMatcher;
    }
    const isState = isObject(glob) && glob.tokens && glob.input;
    if (glob === '' || typeof glob !== 'string' && !isState) {
        throw new TypeError('Expected pattern to be a non-empty string');
    }
    const opts = options || {};
    const posix = opts.windows;
    const regex = isState ? picomatch.compileRe(glob, options) : picomatch.makeRe(glob, options, false, true);
    const state = regex.state;
    delete regex.state;
    let isIgnored = ()=>false;
    if (opts.ignore) {
        const ignoreOpts = {
            ...options,
            ignore: null,
            onMatch: null,
            onResult: null
        };
        isIgnored = picomatch(opts.ignore, ignoreOpts, returnState);
    }
    const matcher = (input, returnObject = false)=>{
        const { isMatch, match, output } = picomatch.test(input, regex, options, {
            glob,
            posix
        });
        const result = {
            glob,
            state,
            regex,
            posix,
            input,
            output,
            match,
            isMatch
        };
        if (typeof opts.onResult === 'function') {
            opts.onResult(result);
        }
        if (isMatch === false) {
            result.isMatch = false;
            return returnObject ? result : false;
        }
        if (isIgnored(input)) {
            if (typeof opts.onIgnore === 'function') {
                opts.onIgnore(result);
            }
            result.isMatch = false;
            return returnObject ? result : false;
        }
        if (typeof opts.onMatch === 'function') {
            opts.onMatch(result);
        }
        return returnObject ? result : true;
    };
    if (returnState) {
        matcher.state = state;
    }
    return matcher;
};
/**
 * Test `input` with the given `regex`. This is used by the main
 * `picomatch()` function to test the input string.
 *
 * ```js
 * const picomatch = require('picomatch');
 * // picomatch.test(input, regex[, options]);
 *
 * console.log(picomatch.test('foo/bar', /^(?:([^/]*?)\/([^/]*?))$/));
 * // { isMatch: true, match: [ 'foo/', 'foo', 'bar' ], output: 'foo/bar' }
 * ```
 * @param {String} `input` String to test.
 * @param {RegExp} `regex`
 * @return {Object} Returns an object with matching info.
 * @api public
 */ picomatch.test = (input, regex, options, { glob, posix } = {})=>{
    if (typeof input !== 'string') {
        throw new TypeError('Expected input to be a string');
    }
    if (input === '') {
        return {
            isMatch: false,
            output: ''
        };
    }
    const opts = options || {};
    const format = opts.format || (posix ? utils.toPosixSlashes : null);
    let match = input === glob;
    let output = match && format ? format(input) : input;
    if (match === false) {
        output = format ? format(input) : input;
        match = output === glob;
    }
    if (match === false || opts.capture === true) {
        if (opts.matchBase === true || opts.basename === true) {
            match = picomatch.matchBase(input, regex, options, posix);
        } else {
            match = regex.exec(output);
        }
    }
    return {
        isMatch: Boolean(match),
        match,
        output
    };
};
/**
 * Match the basename of a filepath.
 *
 * ```js
 * const picomatch = require('picomatch');
 * // picomatch.matchBase(input, glob[, options]);
 * console.log(picomatch.matchBase('foo/bar.js', '*.js'); // true
 * ```
 * @param {String} `input` String to test.
 * @param {RegExp|String} `glob` Glob pattern or regex created by [.makeRe](#makeRe).
 * @return {Boolean}
 * @api public
 */ picomatch.matchBase = (input, glob, options)=>{
    const regex = glob instanceof RegExp ? glob : picomatch.makeRe(glob, options);
    return regex.test(utils.basename(input));
};
/**
 * Returns true if **any** of the given glob `patterns` match the specified `string`.
 *
 * ```js
 * const picomatch = require('picomatch');
 * // picomatch.isMatch(string, patterns[, options]);
 *
 * console.log(picomatch.isMatch('a.a', ['b.*', '*.a'])); //=> true
 * console.log(picomatch.isMatch('a.a', 'b.*')); //=> false
 * ```
 * @param {String|Array} str The string to test.
 * @param {String|Array} patterns One or more glob patterns to use for matching.
 * @param {Object} [options] See available [options](#options).
 * @return {Boolean} Returns true if any patterns match `str`
 * @api public
 */ picomatch.isMatch = (str, patterns, options)=>picomatch(patterns, options)(str);
/**
 * Parse a glob pattern to create the source string for a regular
 * expression.
 *
 * ```js
 * const picomatch = require('picomatch');
 * const result = picomatch.parse(pattern[, options]);
 * ```
 * @param {String} `pattern`
 * @param {Object} `options`
 * @return {Object} Returns an object with useful properties and output to be used as a regex source string.
 * @api public
 */ picomatch.parse = (pattern, options)=>{
    if (Array.isArray(pattern)) return pattern.map((p)=>picomatch.parse(p, options));
    return parse(pattern, {
        ...options,
        fastpaths: false
    });
};
/**
 * Scan a glob pattern to separate the pattern into segments.
 *
 * ```js
 * const picomatch = require('picomatch');
 * // picomatch.scan(input[, options]);
 *
 * const result = picomatch.scan('!./foo/*.js');
 * console.log(result);
 * { prefix: '!./',
 *   input: '!./foo/*.js',
 *   start: 3,
 *   base: 'foo',
 *   glob: '*.js',
 *   isBrace: false,
 *   isBracket: false,
 *   isGlob: true,
 *   isExtglob: false,
 *   isGlobstar: false,
 *   negated: true }
 * ```
 * @param {String} `input` Glob pattern to scan.
 * @param {Object} `options`
 * @return {Object} Returns an object with
 * @api public
 */ picomatch.scan = (input, options)=>scan(input, options);
/**
 * Compile a regular expression from the `state` object returned by the
 * [parse()](#parse) method.
 *
 * ```js
 * const picomatch = require('picomatch');
 * const state = picomatch.parse('*.js');
 * // picomatch.compileRe(state[, options]);
 *
 * console.log(picomatch.compileRe(state));
 * //=> /^(?:(?!\.)(?=.)[^/]*?\.js)$/
 * ```
 * @param {Object} `state`
 * @param {Object} `options`
 * @param {Boolean} `returnOutput` Intended for implementors, this argument allows you to return the raw output from the parser.
 * @param {Boolean} `returnState` Adds the state to a `state` property on the returned regex. Useful for implementors and debugging.
 * @return {RegExp}
 * @api public
 */ picomatch.compileRe = (state, options, returnOutput = false, returnState = false)=>{
    if (returnOutput === true) {
        return state.output;
    }
    const opts = options || {};
    const prepend = opts.contains ? '' : '^';
    const append = opts.contains ? '' : '$';
    let source = `${prepend}(?:${state.output})${append}`;
    if (state && state.negated === true) {
        source = `^(?!${source}).*$`;
    }
    const regex = picomatch.toRegex(source, options);
    if (returnState === true) {
        regex.state = state;
    }
    return regex;
};
/**
 * Create a regular expression from a parsed glob pattern.
 *
 * ```js
 * const picomatch = require('picomatch');
 * // picomatch.makeRe(state[, options]);
 *
 * const result = picomatch.makeRe('*.js');
 * console.log(result);
 * //=> /^(?:(?!\.)(?=.)[^/]*?\.js)$/
 * ```
 * @param {String} `state` The object returned from the `.parse` method.
 * @param {Object} `options`
 * @param {Boolean} `returnOutput` Implementors may use this argument to return the compiled output, instead of a regular expression. This is not exposed on the options to prevent end-users from mutating the result.
 * @param {Boolean} `returnState` Implementors may use this argument to return the state from the parsed glob with the returned regular expression.
 * @return {RegExp} Returns a regex created from the given pattern.
 * @api public
 */ picomatch.makeRe = (input, options = {}, returnOutput = false, returnState = false)=>{
    if (!input || typeof input !== 'string') {
        throw new TypeError('Expected a non-empty string');
    }
    let parsed = {
        negated: false,
        fastpaths: true
    };
    if (options.fastpaths !== false && (input[0] === '.' || input[0] === '*')) {
        parsed.output = parse.fastpaths(input, options);
    }
    if (!parsed.output) {
        parsed = parse(input, options);
    }
    return picomatch.compileRe(parsed, options, returnOutput, returnState);
};
/**
 * Create a regular expression from the given regex source string.
 *
 * ```js
 * const picomatch = require('picomatch');
 * // picomatch.toRegex(source[, options]);
 *
 * const { output } = picomatch.parse('*.js');
 * console.log(picomatch.toRegex(output));
 * //=> /^(?:(?!\.)(?=.)[^/]*?\.js)$/
 * ```
 * @param {String} `source` Regular expression source string.
 * @param {Object} `options`
 * @return {RegExp}
 * @api public
 */ picomatch.toRegex = (source, options)=>{
    try {
        const opts = options || {};
        return new RegExp(source, opts.flags || (opts.nocase ? 'i' : ''));
    } catch (err) {
        if (options && options.debug === true) throw err;
        return /$^/;
    }
};
/**
 * Picomatch constants.
 * @return {Object}
 */ picomatch.constants = constants;
/**
 * Expose "picomatch"
 */ module.exports = picomatch;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/picomatch@4.0.4/node_modules/picomatch/index.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

const pico = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/picomatch@4.0.4/node_modules/picomatch/lib/picomatch.js [instrumentation] (ecmascript)");
const utils = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/picomatch@4.0.4/node_modules/picomatch/lib/utils.js [instrumentation] (ecmascript)");
function picomatch(glob, options, returnState = false) {
    // default to os.platform()
    if (options && (options.windows === null || options.windows === undefined)) {
        // don't mutate the original options object
        options = {
            ...options,
            windows: utils.isWindows()
        };
    }
    return pico(glob, options, returnState);
}
Object.assign(picomatch, pico);
module.exports = picomatch;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/kind-of@6.0.3/node_modules/kind-of/index.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {

var toString = Object.prototype.toString;
module.exports = function kindOf(val) {
    if (val === void 0) return 'undefined';
    if (val === null) return 'null';
    var type = typeof val;
    if (type === 'boolean') return 'boolean';
    if (type === 'string') return 'string';
    if (type === 'number') return 'number';
    if (type === 'symbol') return 'symbol';
    if (type === 'function') {
        return isGeneratorFn(val) ? 'generatorfunction' : 'function';
    }
    if (isArray(val)) return 'array';
    if (isBuffer(val)) return 'buffer';
    if (isArguments(val)) return 'arguments';
    if (isDate(val)) return 'date';
    if (isError(val)) return 'error';
    if (isRegexp(val)) return 'regexp';
    switch(ctorName(val)){
        case 'Symbol':
            return 'symbol';
        case 'Promise':
            return 'promise';
        // Set, Map, WeakSet, WeakMap
        case 'WeakMap':
            return 'weakmap';
        case 'WeakSet':
            return 'weakset';
        case 'Map':
            return 'map';
        case 'Set':
            return 'set';
        // 8-bit typed arrays
        case 'Int8Array':
            return 'int8array';
        case 'Uint8Array':
            return 'uint8array';
        case 'Uint8ClampedArray':
            return 'uint8clampedarray';
        // 16-bit typed arrays
        case 'Int16Array':
            return 'int16array';
        case 'Uint16Array':
            return 'uint16array';
        // 32-bit typed arrays
        case 'Int32Array':
            return 'int32array';
        case 'Uint32Array':
            return 'uint32array';
        case 'Float32Array':
            return 'float32array';
        case 'Float64Array':
            return 'float64array';
    }
    if (isGeneratorObj(val)) {
        return 'generator';
    }
    // Non-plain objects
    type = toString.call(val);
    switch(type){
        case '[object Object]':
            return 'object';
        // iterators
        case '[object Map Iterator]':
            return 'mapiterator';
        case '[object Set Iterator]':
            return 'setiterator';
        case '[object String Iterator]':
            return 'stringiterator';
        case '[object Array Iterator]':
            return 'arrayiterator';
    }
    // other
    return type.slice(8, -1).toLowerCase().replace(/\s/g, '');
};
function ctorName(val) {
    return typeof val.constructor === 'function' ? val.constructor.name : null;
}
function isArray(val) {
    if (Array.isArray) return Array.isArray(val);
    return val instanceof Array;
}
function isError(val) {
    return val instanceof Error || typeof val.message === 'string' && val.constructor && typeof val.constructor.stackTraceLimit === 'number';
}
function isDate(val) {
    if (val instanceof Date) return true;
    return typeof val.toDateString === 'function' && typeof val.getDate === 'function' && typeof val.setDate === 'function';
}
function isRegexp(val) {
    if (val instanceof RegExp) return true;
    return typeof val.flags === 'string' && typeof val.ignoreCase === 'boolean' && typeof val.multiline === 'boolean' && typeof val.global === 'boolean';
}
function isGeneratorFn(name, val) {
    return ctorName(name) === 'GeneratorFunction';
}
function isGeneratorObj(val) {
    return typeof val.throw === 'function' && typeof val.return === 'function' && typeof val.next === 'function';
}
function isArguments(val) {
    try {
        if (typeof val.length === 'number' && typeof val.callee === 'function') {
            return true;
        }
    } catch (err) {
        if (err.message.indexOf('callee') !== -1) {
            return true;
        }
    }
    return false;
}
/**
 * If you need to support Safari 5-7 (8-10 yr-old browser),
 * take a look at https://github.com/feross/is-buffer
 */ function isBuffer(val) {
    if (val.constructor && typeof val.constructor.isBuffer === 'function') {
        return val.constructor.isBuffer(val);
    }
    return false;
}
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/is-extendable@0.1.1/node_modules/is-extendable/index.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

/*!
 * is-extendable <https://github.com/jonschlinkert/is-extendable>
 *
 * Copyright (c) 2015, Jon Schlinkert.
 * Licensed under the MIT License.
 */ module.exports = function isExtendable(val) {
    return typeof val !== 'undefined' && val !== null && (typeof val === 'object' || typeof val === 'function');
};
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/extend-shallow@2.0.1/node_modules/extend-shallow/index.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var isObject = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/is-extendable@0.1.1/node_modules/is-extendable/index.js [instrumentation] (ecmascript)");
module.exports = function extend(o /*, objects*/ ) {
    if (!isObject(o)) {
        o = {};
    }
    var len = arguments.length;
    for(var i = 1; i < len; i++){
        var obj = arguments[i];
        if (isObject(obj)) {
            assign(o, obj);
        }
    }
    return o;
};
function assign(a, b) {
    for(var key in b){
        if (hasOwn(b, key)) {
            a[key] = b[key];
        }
    }
}
/**
 * Returns true if the given `key` is an own property of `obj`.
 */ function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/section-matter@1.0.0/node_modules/section-matter/index.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var typeOf = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/kind-of@6.0.3/node_modules/kind-of/index.js [instrumentation] (ecmascript)");
var extend = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/extend-shallow@2.0.1/node_modules/extend-shallow/index.js [instrumentation] (ecmascript)");
/**
 * Parse sections in `input` with the given `options`.
 *
 * ```js
 * var sections = require('{%= name %}');
 * var result = sections(input, options);
 * // { content: 'Content before sections', sections: [] }
 * ```
 * @param {String|Buffer|Object} `input` If input is an object, it's `content` property must be a string or buffer.
 * @param {Object} options
 * @return {Object} Returns an object with a `content` string and an array of `sections` objects.
 * @api public
 */ module.exports = function(input, options) {
    if (typeof options === 'function') {
        options = {
            parse: options
        };
    }
    var file = toObject(input);
    var defaults = {
        section_delimiter: '---',
        parse: identity
    };
    var opts = extend({}, defaults, options);
    var delim = opts.section_delimiter;
    var lines = file.content.split(/\r?\n/);
    var sections = null;
    var section = createSection();
    var content = [];
    var stack = [];
    function initSections(val) {
        file.content = val;
        sections = [];
        content = [];
    }
    function closeSection(val) {
        if (stack.length) {
            section.key = getKey(stack[0], delim);
            section.content = val;
            opts.parse(section, sections);
            sections.push(section);
            section = createSection();
            content = [];
            stack = [];
        }
    }
    for(var i = 0; i < lines.length; i++){
        var line = lines[i];
        var len = stack.length;
        var ln = line.trim();
        if (isDelimiter(ln, delim)) {
            if (ln.length === 3 && i !== 0) {
                if (len === 0 || len === 2) {
                    content.push(line);
                    continue;
                }
                stack.push(ln);
                section.data = content.join('\n');
                content = [];
                continue;
            }
            if (sections === null) {
                initSections(content.join('\n'));
            }
            if (len === 2) {
                closeSection(content.join('\n'));
            }
            stack.push(ln);
            continue;
        }
        content.push(line);
    }
    if (sections === null) {
        initSections(content.join('\n'));
    } else {
        closeSection(content.join('\n'));
    }
    file.sections = sections;
    return file;
};
function isDelimiter(line, delim) {
    if (line.slice(0, delim.length) !== delim) {
        return false;
    }
    if (line.charAt(delim.length + 1) === delim.slice(-1)) {
        return false;
    }
    return true;
}
function toObject(input) {
    if (typeOf(input) !== 'object') {
        input = {
            content: input
        };
    }
    if (typeof input.content !== 'string' && !isBuffer(input.content)) {
        throw new TypeError('expected a buffer or string');
    }
    input.content = input.content.toString();
    input.sections = [];
    return input;
}
function getKey(val, delim) {
    return val ? val.slice(delim.length).trim() : '';
}
function createSection() {
    return {
        key: '',
        data: '',
        content: ''
    };
}
function identity(val) {
    return val;
}
function isBuffer(val) {
    if (val && val.constructor && typeof val.constructor.isBuffer === 'function') {
        return val.constructor.isBuffer(val);
    }
    return false;
}
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/exception.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

// YAML error class. http://stackoverflow.com/questions/8458984
//
function YAMLException(reason, mark) {
    // Super constructor
    Error.call(this);
    this.name = 'YAMLException';
    this.reason = reason;
    this.mark = mark;
    this.message = (this.reason || '(unknown reason)') + (this.mark ? ' ' + this.mark.toString() : '');
    // Include stack trace in error object
    if (Error.captureStackTrace) {
        // Chrome and NodeJS
        Error.captureStackTrace(this, this.constructor);
    } else {
        // FF, IE 10+ and Safari 6+. Fallback for others
        this.stack = new Error().stack || '';
    }
}
// Inherit from Error
YAMLException.prototype = Object.create(Error.prototype);
YAMLException.prototype.constructor = YAMLException;
YAMLException.prototype.toString = function toString(compact) {
    var result = this.name + ': ';
    result += this.reason || '(unknown reason)';
    if (!compact && this.mark) {
        result += ' ' + this.mark.toString();
    }
    return result;
};
module.exports = YAMLException;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var YAMLException = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/exception.js [instrumentation] (ecmascript)");
var TYPE_CONSTRUCTOR_OPTIONS = [
    'kind',
    'resolve',
    'construct',
    'instanceOf',
    'predicate',
    'represent',
    'defaultStyle',
    'styleAliases'
];
var YAML_NODE_KINDS = [
    'scalar',
    'sequence',
    'mapping'
];
function compileStyleAliases(map) {
    var result = {};
    if (map !== null) {
        Object.keys(map).forEach(function(style) {
            map[style].forEach(function(alias) {
                result[String(alias)] = style;
            });
        });
    }
    return result;
}
function Type(tag, options) {
    options = options || {};
    Object.keys(options).forEach(function(name) {
        if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
            throw new YAMLException('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
        }
    });
    // TODO: Add tag format check.
    this.tag = tag;
    this.kind = options['kind'] || null;
    this.resolve = options['resolve'] || function() {
        return true;
    };
    this.construct = options['construct'] || function(data) {
        return data;
    };
    this.instanceOf = options['instanceOf'] || null;
    this.predicate = options['predicate'] || null;
    this.represent = options['represent'] || null;
    this.defaultStyle = options['defaultStyle'] || null;
    this.styleAliases = compileStyleAliases(options['styleAliases'] || null);
    if (YAML_NODE_KINDS.indexOf(this.kind) === -1) {
        throw new YAMLException('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
    }
}
module.exports = Type;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/common.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

function isNothing(subject) {
    return typeof subject === 'undefined' || subject === null;
}
function isObject(subject) {
    return typeof subject === 'object' && subject !== null;
}
function toArray(sequence) {
    if (Array.isArray(sequence)) return sequence;
    else if (isNothing(sequence)) return [];
    return [
        sequence
    ];
}
function extend(target, source) {
    var index, length, key, sourceKeys;
    if (source) {
        sourceKeys = Object.keys(source);
        for(index = 0, length = sourceKeys.length; index < length; index += 1){
            key = sourceKeys[index];
            target[key] = source[key];
        }
    }
    return target;
}
function repeat(string, count) {
    var result = '', cycle;
    for(cycle = 0; cycle < count; cycle += 1){
        result += string;
    }
    return result;
}
function isNegativeZero(number) {
    return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
}
module.exports.isNothing = isNothing;
module.exports.isObject = isObject;
module.exports.toArray = toArray;
module.exports.repeat = repeat;
module.exports.isNegativeZero = isNegativeZero;
module.exports.extend = extend;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/schema.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

/*eslint-disable max-len*/ var common = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/common.js [instrumentation] (ecmascript)");
var YAMLException = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/exception.js [instrumentation] (ecmascript)");
var Type = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type.js [instrumentation] (ecmascript)");
function compileList(schema, name, result) {
    var exclude = [];
    schema.include.forEach(function(includedSchema) {
        result = compileList(includedSchema, name, result);
    });
    schema[name].forEach(function(currentType) {
        result.forEach(function(previousType, previousIndex) {
            if (previousType.tag === currentType.tag && previousType.kind === currentType.kind) {
                exclude.push(previousIndex);
            }
        });
        result.push(currentType);
    });
    return result.filter(function(type, index) {
        return exclude.indexOf(index) === -1;
    });
}
function compileMap() {
    var result = {
        scalar: {},
        sequence: {},
        mapping: {},
        fallback: {}
    }, index, length;
    function collectType(type) {
        result[type.kind][type.tag] = result['fallback'][type.tag] = type;
    }
    for(index = 0, length = arguments.length; index < length; index += 1){
        arguments[index].forEach(collectType);
    }
    return result;
}
function Schema(definition) {
    this.include = definition.include || [];
    this.implicit = definition.implicit || [];
    this.explicit = definition.explicit || [];
    this.implicit.forEach(function(type) {
        if (type.loadKind && type.loadKind !== 'scalar') {
            throw new YAMLException('There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.');
        }
    });
    this.compiledImplicit = compileList(this, 'implicit', []);
    this.compiledExplicit = compileList(this, 'explicit', []);
    this.compiledTypeMap = compileMap(this.compiledImplicit, this.compiledExplicit);
}
Schema.DEFAULT = null;
Schema.create = function createSchema() {
    var schemas, types;
    switch(arguments.length){
        case 1:
            schemas = Schema.DEFAULT;
            types = arguments[0];
            break;
        case 2:
            schemas = arguments[0];
            types = arguments[1];
            break;
        default:
            throw new YAMLException('Wrong number of arguments for Schema.create function');
    }
    schemas = common.toArray(schemas);
    types = common.toArray(types);
    if (!schemas.every(function(schema) {
        return schema instanceof Schema;
    })) {
        throw new YAMLException('Specified list of super schemas (or a single Schema object) contains a non-Schema object.');
    }
    if (!types.every(function(type) {
        return type instanceof Type;
    })) {
        throw new YAMLException('Specified list of YAML types (or a single Type object) contains a non-Type object.');
    }
    return new Schema({
        include: schemas,
        explicit: types
    });
};
module.exports = Schema;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/str.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var Type = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type.js [instrumentation] (ecmascript)");
module.exports = new Type('tag:yaml.org,2002:str', {
    kind: 'scalar',
    construct: function(data) {
        return data !== null ? data : '';
    }
});
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/seq.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var Type = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type.js [instrumentation] (ecmascript)");
module.exports = new Type('tag:yaml.org,2002:seq', {
    kind: 'sequence',
    construct: function(data) {
        return data !== null ? data : [];
    }
});
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/map.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var Type = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type.js [instrumentation] (ecmascript)");
module.exports = new Type('tag:yaml.org,2002:map', {
    kind: 'mapping',
    construct: function(data) {
        return data !== null ? data : {};
    }
});
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/schema/failsafe.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

// Standard YAML's Failsafe schema.
// http://www.yaml.org/spec/1.2/spec.html#id2802346
var Schema = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/schema.js [instrumentation] (ecmascript)");
module.exports = new Schema({
    explicit: [
        __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/str.js [instrumentation] (ecmascript)"),
        __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/seq.js [instrumentation] (ecmascript)"),
        __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/map.js [instrumentation] (ecmascript)")
    ]
});
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/null.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var Type = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type.js [instrumentation] (ecmascript)");
function resolveYamlNull(data) {
    if (data === null) return true;
    var max = data.length;
    return max === 1 && data === '~' || max === 4 && (data === 'null' || data === 'Null' || data === 'NULL');
}
function constructYamlNull() {
    return null;
}
function isNull(object) {
    return object === null;
}
module.exports = new Type('tag:yaml.org,2002:null', {
    kind: 'scalar',
    resolve: resolveYamlNull,
    construct: constructYamlNull,
    predicate: isNull,
    represent: {
        canonical: function() {
            return '~';
        },
        lowercase: function() {
            return 'null';
        },
        uppercase: function() {
            return 'NULL';
        },
        camelcase: function() {
            return 'Null';
        }
    },
    defaultStyle: 'lowercase'
});
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/bool.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var Type = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type.js [instrumentation] (ecmascript)");
function resolveYamlBoolean(data) {
    if (data === null) return false;
    var max = data.length;
    return max === 4 && (data === 'true' || data === 'True' || data === 'TRUE') || max === 5 && (data === 'false' || data === 'False' || data === 'FALSE');
}
function constructYamlBoolean(data) {
    return data === 'true' || data === 'True' || data === 'TRUE';
}
function isBoolean(object) {
    return Object.prototype.toString.call(object) === '[object Boolean]';
}
module.exports = new Type('tag:yaml.org,2002:bool', {
    kind: 'scalar',
    resolve: resolveYamlBoolean,
    construct: constructYamlBoolean,
    predicate: isBoolean,
    represent: {
        lowercase: function(object) {
            return object ? 'true' : 'false';
        },
        uppercase: function(object) {
            return object ? 'TRUE' : 'FALSE';
        },
        camelcase: function(object) {
            return object ? 'True' : 'False';
        }
    },
    defaultStyle: 'lowercase'
});
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/int.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var common = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/common.js [instrumentation] (ecmascript)");
var Type = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type.js [instrumentation] (ecmascript)");
function isHexCode(c) {
    return 0x30 /* 0 */  <= c && c <= 0x39 /* 9 */  || 0x41 /* A */  <= c && c <= 0x46 /* F */  || 0x61 /* a */  <= c && c <= 0x66 /* f */ ;
}
function isOctCode(c) {
    return 0x30 /* 0 */  <= c && c <= 0x37 /* 7 */ ;
}
function isDecCode(c) {
    return 0x30 /* 0 */  <= c && c <= 0x39 /* 9 */ ;
}
function resolveYamlInteger(data) {
    if (data === null) return false;
    var max = data.length, index = 0, hasDigits = false, ch;
    if (!max) return false;
    ch = data[index];
    // sign
    if (ch === '-' || ch === '+') {
        ch = data[++index];
    }
    if (ch === '0') {
        // 0
        if (index + 1 === max) return true;
        ch = data[++index];
        // base 2, base 8, base 16
        if (ch === 'b') {
            // base 2
            index++;
            for(; index < max; index++){
                ch = data[index];
                if (ch === '_') continue;
                if (ch !== '0' && ch !== '1') return false;
                hasDigits = true;
            }
            return hasDigits && ch !== '_';
        }
        if (ch === 'x') {
            // base 16
            index++;
            for(; index < max; index++){
                ch = data[index];
                if (ch === '_') continue;
                if (!isHexCode(data.charCodeAt(index))) return false;
                hasDigits = true;
            }
            return hasDigits && ch !== '_';
        }
        // base 8
        for(; index < max; index++){
            ch = data[index];
            if (ch === '_') continue;
            if (!isOctCode(data.charCodeAt(index))) return false;
            hasDigits = true;
        }
        return hasDigits && ch !== '_';
    }
    // base 10 (except 0) or base 60
    // value should not start with `_`;
    if (ch === '_') return false;
    for(; index < max; index++){
        ch = data[index];
        if (ch === '_') continue;
        if (ch === ':') break;
        if (!isDecCode(data.charCodeAt(index))) {
            return false;
        }
        hasDigits = true;
    }
    // Should have digits and should not end with `_`
    if (!hasDigits || ch === '_') return false;
    // if !base60 - done;
    if (ch !== ':') return true;
    // base60 almost not used, no needs to optimize
    return /^(:[0-5]?[0-9])+$/.test(data.slice(index));
}
function constructYamlInteger(data) {
    var value = data, sign = 1, ch, base, digits = [];
    if (value.indexOf('_') !== -1) {
        value = value.replace(/_/g, '');
    }
    ch = value[0];
    if (ch === '-' || ch === '+') {
        if (ch === '-') sign = -1;
        value = value.slice(1);
        ch = value[0];
    }
    if (value === '0') return 0;
    if (ch === '0') {
        if (value[1] === 'b') return sign * parseInt(value.slice(2), 2);
        if (value[1] === 'x') return sign * parseInt(value, 16);
        return sign * parseInt(value, 8);
    }
    if (value.indexOf(':') !== -1) {
        value.split(':').forEach(function(v) {
            digits.unshift(parseInt(v, 10));
        });
        value = 0;
        base = 1;
        digits.forEach(function(d) {
            value += d * base;
            base *= 60;
        });
        return sign * value;
    }
    return sign * parseInt(value, 10);
}
function isInteger(object) {
    return Object.prototype.toString.call(object) === '[object Number]' && object % 1 === 0 && !common.isNegativeZero(object);
}
module.exports = new Type('tag:yaml.org,2002:int', {
    kind: 'scalar',
    resolve: resolveYamlInteger,
    construct: constructYamlInteger,
    predicate: isInteger,
    represent: {
        binary: function(obj) {
            return obj >= 0 ? '0b' + obj.toString(2) : '-0b' + obj.toString(2).slice(1);
        },
        octal: function(obj) {
            return obj >= 0 ? '0' + obj.toString(8) : '-0' + obj.toString(8).slice(1);
        },
        decimal: function(obj) {
            return obj.toString(10);
        },
        /* eslint-disable max-len */ hexadecimal: function(obj) {
            return obj >= 0 ? '0x' + obj.toString(16).toUpperCase() : '-0x' + obj.toString(16).toUpperCase().slice(1);
        }
    },
    defaultStyle: 'decimal',
    styleAliases: {
        binary: [
            2,
            'bin'
        ],
        octal: [
            8,
            'oct'
        ],
        decimal: [
            10,
            'dec'
        ],
        hexadecimal: [
            16,
            'hex'
        ]
    }
});
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/float.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var common = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/common.js [instrumentation] (ecmascript)");
var Type = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type.js [instrumentation] (ecmascript)");
var YAML_FLOAT_PATTERN = new RegExp(// 2.5e4, 2.5 and integers
'^(?:[-+]?(?:0|[1-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?' + // .2e4, .2
// special case, seems not from spec
'|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?' + // 20:59
'|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\\.[0-9_]*' + // .inf
'|[-+]?\\.(?:inf|Inf|INF)' + // .nan
'|\\.(?:nan|NaN|NAN))$');
function resolveYamlFloat(data) {
    if (data === null) return false;
    if (!YAML_FLOAT_PATTERN.test(data) || // Quick hack to not allow integers end with `_`
    // Probably should update regexp & check speed
    data[data.length - 1] === '_') {
        return false;
    }
    return true;
}
function constructYamlFloat(data) {
    var value, sign, base, digits;
    value = data.replace(/_/g, '').toLowerCase();
    sign = value[0] === '-' ? -1 : 1;
    digits = [];
    if ('+-'.indexOf(value[0]) >= 0) {
        value = value.slice(1);
    }
    if (value === '.inf') {
        return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    } else if (value === '.nan') {
        return NaN;
    } else if (value.indexOf(':') >= 0) {
        value.split(':').forEach(function(v) {
            digits.unshift(parseFloat(v, 10));
        });
        value = 0.0;
        base = 1;
        digits.forEach(function(d) {
            value += d * base;
            base *= 60;
        });
        return sign * value;
    }
    return sign * parseFloat(value, 10);
}
var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
function representYamlFloat(object, style) {
    var res;
    if (isNaN(object)) {
        switch(style){
            case 'lowercase':
                return '.nan';
            case 'uppercase':
                return '.NAN';
            case 'camelcase':
                return '.NaN';
        }
    } else if (Number.POSITIVE_INFINITY === object) {
        switch(style){
            case 'lowercase':
                return '.inf';
            case 'uppercase':
                return '.INF';
            case 'camelcase':
                return '.Inf';
        }
    } else if (Number.NEGATIVE_INFINITY === object) {
        switch(style){
            case 'lowercase':
                return '-.inf';
            case 'uppercase':
                return '-.INF';
            case 'camelcase':
                return '-.Inf';
        }
    } else if (common.isNegativeZero(object)) {
        return '-0.0';
    }
    res = object.toString(10);
    // JS stringifier can build scientific format without dots: 5e-100,
    // while YAML requres dot: 5.e-100. Fix it with simple hack
    return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace('e', '.e') : res;
}
function isFloat(object) {
    return Object.prototype.toString.call(object) === '[object Number]' && (object % 1 !== 0 || common.isNegativeZero(object));
}
module.exports = new Type('tag:yaml.org,2002:float', {
    kind: 'scalar',
    resolve: resolveYamlFloat,
    construct: constructYamlFloat,
    predicate: isFloat,
    represent: representYamlFloat,
    defaultStyle: 'lowercase'
});
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/schema/json.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

// Standard YAML's JSON schema.
// http://www.yaml.org/spec/1.2/spec.html#id2803231
//
// NOTE: JS-YAML does not support schema-specific tag resolution restrictions.
// So, this schema is not such strict as defined in the YAML specification.
// It allows numbers in binary notaion, use `Null` and `NULL` as `null`, etc.
var Schema = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/schema.js [instrumentation] (ecmascript)");
module.exports = new Schema({
    include: [
        __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/schema/failsafe.js [instrumentation] (ecmascript)")
    ],
    implicit: [
        __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/null.js [instrumentation] (ecmascript)"),
        __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/bool.js [instrumentation] (ecmascript)"),
        __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/int.js [instrumentation] (ecmascript)"),
        __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/float.js [instrumentation] (ecmascript)")
    ]
});
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/schema/core.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

// Standard YAML's Core schema.
// http://www.yaml.org/spec/1.2/spec.html#id2804923
//
// NOTE: JS-YAML does not support schema-specific tag resolution restrictions.
// So, Core schema has no distinctions from JSON schema is JS-YAML.
var Schema = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/schema.js [instrumentation] (ecmascript)");
module.exports = new Schema({
    include: [
        __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/schema/json.js [instrumentation] (ecmascript)")
    ]
});
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/timestamp.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var Type = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type.js [instrumentation] (ecmascript)");
var YAML_DATE_REGEXP = new RegExp('^([0-9][0-9][0-9][0-9])' + // [1] year
'-([0-9][0-9])' + // [2] month
'-([0-9][0-9])$'); // [3] day
var YAML_TIMESTAMP_REGEXP = new RegExp('^([0-9][0-9][0-9][0-9])' + // [1] year
'-([0-9][0-9]?)' + // [2] month
'-([0-9][0-9]?)' + // [3] day
'(?:[Tt]|[ \\t]+)' + // ...
'([0-9][0-9]?)' + // [4] hour
':([0-9][0-9])' + // [5] minute
':([0-9][0-9])' + // [6] second
'(?:\\.([0-9]*))?' + // [7] fraction
'(?:[ \\t]*(Z|([-+])([0-9][0-9]?)' + // [8] tz [9] tz_sign [10] tz_hour
'(?::([0-9][0-9]))?))?$'); // [11] tz_minute
function resolveYamlTimestamp(data) {
    if (data === null) return false;
    if (YAML_DATE_REGEXP.exec(data) !== null) return true;
    if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
    return false;
}
function constructYamlTimestamp(data) {
    var match, year, month, day, hour, minute, second, fraction = 0, delta = null, tz_hour, tz_minute, date;
    match = YAML_DATE_REGEXP.exec(data);
    if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);
    if (match === null) throw new Error('Date resolve error');
    // match: [1] year [2] month [3] day
    year = +match[1];
    month = +match[2] - 1; // JS month starts with 0
    day = +match[3];
    if (!match[4]) {
        return new Date(Date.UTC(year, month, day));
    }
    // match: [4] hour [5] minute [6] second [7] fraction
    hour = +match[4];
    minute = +match[5];
    second = +match[6];
    if (match[7]) {
        fraction = match[7].slice(0, 3);
        while(fraction.length < 3){
            fraction += '0';
        }
        fraction = +fraction;
    }
    // match: [8] tz [9] tz_sign [10] tz_hour [11] tz_minute
    if (match[9]) {
        tz_hour = +match[10];
        tz_minute = +(match[11] || 0);
        delta = (tz_hour * 60 + tz_minute) * 60000; // delta in mili-seconds
        if (match[9] === '-') delta = -delta;
    }
    date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
    if (delta) date.setTime(date.getTime() - delta);
    return date;
}
function representYamlTimestamp(object /*, style*/ ) {
    return object.toISOString();
}
module.exports = new Type('tag:yaml.org,2002:timestamp', {
    kind: 'scalar',
    resolve: resolveYamlTimestamp,
    construct: constructYamlTimestamp,
    instanceOf: Date,
    represent: representYamlTimestamp
});
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/merge.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var Type = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type.js [instrumentation] (ecmascript)");
function resolveYamlMerge(data) {
    return data === '<<' || data === null;
}
module.exports = new Type('tag:yaml.org,2002:merge', {
    kind: 'scalar',
    resolve: resolveYamlMerge
});
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/binary.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

/*eslint-disable no-bitwise*/ var NodeBuffer;
try {
    // A trick for browserified version, to not include `Buffer` shim
    var _require = /*TURBOPACK member replacement*/ __turbopack_context__.t;
    NodeBuffer = __turbopack_context__.r("[externals]/buffer [external] (buffer, cjs)").Buffer;
} catch (__) {}
var Type = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type.js [instrumentation] (ecmascript)");
// [ 64, 65, 66 ] -> [ padding, CR, LF ]
var BASE64_MAP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r';
function resolveYamlBinary(data) {
    if (data === null) return false;
    var code, idx, bitlen = 0, max = data.length, map = BASE64_MAP;
    // Convert one by one.
    for(idx = 0; idx < max; idx++){
        code = map.indexOf(data.charAt(idx));
        // Skip CR/LF
        if (code > 64) continue;
        // Fail on illegal characters
        if (code < 0) return false;
        bitlen += 6;
    }
    // If there are any bits left, source was corrupted
    return bitlen % 8 === 0;
}
function constructYamlBinary(data) {
    var idx, tailbits, input = data.replace(/[\r\n=]/g, ''), max = input.length, map = BASE64_MAP, bits = 0, result = [];
    // Collect by 6*4 bits (3 bytes)
    for(idx = 0; idx < max; idx++){
        if (idx % 4 === 0 && idx) {
            result.push(bits >> 16 & 0xFF);
            result.push(bits >> 8 & 0xFF);
            result.push(bits & 0xFF);
        }
        bits = bits << 6 | map.indexOf(input.charAt(idx));
    }
    // Dump tail
    tailbits = max % 4 * 6;
    if (tailbits === 0) {
        result.push(bits >> 16 & 0xFF);
        result.push(bits >> 8 & 0xFF);
        result.push(bits & 0xFF);
    } else if (tailbits === 18) {
        result.push(bits >> 10 & 0xFF);
        result.push(bits >> 2 & 0xFF);
    } else if (tailbits === 12) {
        result.push(bits >> 4 & 0xFF);
    }
    // Wrap into Buffer for NodeJS and leave Array for browser
    if (NodeBuffer) {
        // Support node 6.+ Buffer API when available
        return NodeBuffer.from ? NodeBuffer.from(result) : new NodeBuffer(result);
    }
    return result;
}
function representYamlBinary(object /*, style*/ ) {
    var result = '', bits = 0, idx, tail, max = object.length, map = BASE64_MAP;
    // Convert every three bytes to 4 ASCII characters.
    for(idx = 0; idx < max; idx++){
        if (idx % 3 === 0 && idx) {
            result += map[bits >> 18 & 0x3F];
            result += map[bits >> 12 & 0x3F];
            result += map[bits >> 6 & 0x3F];
            result += map[bits & 0x3F];
        }
        bits = (bits << 8) + object[idx];
    }
    // Dump tail
    tail = max % 3;
    if (tail === 0) {
        result += map[bits >> 18 & 0x3F];
        result += map[bits >> 12 & 0x3F];
        result += map[bits >> 6 & 0x3F];
        result += map[bits & 0x3F];
    } else if (tail === 2) {
        result += map[bits >> 10 & 0x3F];
        result += map[bits >> 4 & 0x3F];
        result += map[bits << 2 & 0x3F];
        result += map[64];
    } else if (tail === 1) {
        result += map[bits >> 2 & 0x3F];
        result += map[bits << 4 & 0x3F];
        result += map[64];
        result += map[64];
    }
    return result;
}
function isBinary(object) {
    return NodeBuffer && NodeBuffer.isBuffer(object);
}
module.exports = new Type('tag:yaml.org,2002:binary', {
    kind: 'scalar',
    resolve: resolveYamlBinary,
    construct: constructYamlBinary,
    predicate: isBinary,
    represent: representYamlBinary
});
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/omap.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var Type = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type.js [instrumentation] (ecmascript)");
var _hasOwnProperty = Object.prototype.hasOwnProperty;
var _toString = Object.prototype.toString;
function resolveYamlOmap(data) {
    if (data === null) return true;
    var objectKeys = [], index, length, pair, pairKey, pairHasKey, object = data;
    for(index = 0, length = object.length; index < length; index += 1){
        pair = object[index];
        pairHasKey = false;
        if (_toString.call(pair) !== '[object Object]') return false;
        for(pairKey in pair){
            if (_hasOwnProperty.call(pair, pairKey)) {
                if (!pairHasKey) pairHasKey = true;
                else return false;
            }
        }
        if (!pairHasKey) return false;
        if (objectKeys.indexOf(pairKey) === -1) objectKeys.push(pairKey);
        else return false;
    }
    return true;
}
function constructYamlOmap(data) {
    return data !== null ? data : [];
}
module.exports = new Type('tag:yaml.org,2002:omap', {
    kind: 'sequence',
    resolve: resolveYamlOmap,
    construct: constructYamlOmap
});
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/pairs.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var Type = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type.js [instrumentation] (ecmascript)");
var _toString = Object.prototype.toString;
function resolveYamlPairs(data) {
    if (data === null) return true;
    var index, length, pair, keys, result, object = data;
    result = new Array(object.length);
    for(index = 0, length = object.length; index < length; index += 1){
        pair = object[index];
        if (_toString.call(pair) !== '[object Object]') return false;
        keys = Object.keys(pair);
        if (keys.length !== 1) return false;
        result[index] = [
            keys[0],
            pair[keys[0]]
        ];
    }
    return true;
}
function constructYamlPairs(data) {
    if (data === null) return [];
    var index, length, pair, keys, result, object = data;
    result = new Array(object.length);
    for(index = 0, length = object.length; index < length; index += 1){
        pair = object[index];
        keys = Object.keys(pair);
        result[index] = [
            keys[0],
            pair[keys[0]]
        ];
    }
    return result;
}
module.exports = new Type('tag:yaml.org,2002:pairs', {
    kind: 'sequence',
    resolve: resolveYamlPairs,
    construct: constructYamlPairs
});
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/set.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var Type = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type.js [instrumentation] (ecmascript)");
var _hasOwnProperty = Object.prototype.hasOwnProperty;
function resolveYamlSet(data) {
    if (data === null) return true;
    var key, object = data;
    for(key in object){
        if (_hasOwnProperty.call(object, key)) {
            if (object[key] !== null) return false;
        }
    }
    return true;
}
function constructYamlSet(data) {
    return data !== null ? data : {};
}
module.exports = new Type('tag:yaml.org,2002:set', {
    kind: 'mapping',
    resolve: resolveYamlSet,
    construct: constructYamlSet
});
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/schema/default_safe.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

// JS-YAML's default schema for `safeLoad` function.
// It is not described in the YAML specification.
//
// This schema is based on standard YAML's Core schema and includes most of
// extra types described at YAML tag repository. (http://yaml.org/type/)
var Schema = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/schema.js [instrumentation] (ecmascript)");
module.exports = new Schema({
    include: [
        __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/schema/core.js [instrumentation] (ecmascript)")
    ],
    implicit: [
        __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/timestamp.js [instrumentation] (ecmascript)"),
        __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/merge.js [instrumentation] (ecmascript)")
    ],
    explicit: [
        __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/binary.js [instrumentation] (ecmascript)"),
        __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/omap.js [instrumentation] (ecmascript)"),
        __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/pairs.js [instrumentation] (ecmascript)"),
        __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/set.js [instrumentation] (ecmascript)")
    ]
});
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/js/undefined.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var Type = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type.js [instrumentation] (ecmascript)");
function resolveJavascriptUndefined() {
    return true;
}
function constructJavascriptUndefined() {
    /*eslint-disable no-undefined*/ return undefined;
}
function representJavascriptUndefined() {
    return '';
}
function isUndefined(object) {
    return typeof object === 'undefined';
}
module.exports = new Type('tag:yaml.org,2002:js/undefined', {
    kind: 'scalar',
    resolve: resolveJavascriptUndefined,
    construct: constructJavascriptUndefined,
    predicate: isUndefined,
    represent: representJavascriptUndefined
});
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/js/regexp.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var Type = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type.js [instrumentation] (ecmascript)");
function resolveJavascriptRegExp(data) {
    if (data === null) return false;
    if (data.length === 0) return false;
    var regexp = data, tail = /\/([gim]*)$/.exec(data), modifiers = '';
    // if regexp starts with '/' it can have modifiers and must be properly closed
    // `/foo/gim` - modifiers tail can be maximum 3 chars
    if (regexp[0] === '/') {
        if (tail) modifiers = tail[1];
        if (modifiers.length > 3) return false;
        // if expression starts with /, is should be properly terminated
        if (regexp[regexp.length - modifiers.length - 1] !== '/') return false;
    }
    return true;
}
function constructJavascriptRegExp(data) {
    var regexp = data, tail = /\/([gim]*)$/.exec(data), modifiers = '';
    // `/foo/gim` - tail can be maximum 4 chars
    if (regexp[0] === '/') {
        if (tail) modifiers = tail[1];
        regexp = regexp.slice(1, regexp.length - modifiers.length - 1);
    }
    return new RegExp(regexp, modifiers);
}
function representJavascriptRegExp(object /*, style*/ ) {
    var result = '/' + object.source + '/';
    if (object.global) result += 'g';
    if (object.multiline) result += 'm';
    if (object.ignoreCase) result += 'i';
    return result;
}
function isRegExp(object) {
    return Object.prototype.toString.call(object) === '[object RegExp]';
}
module.exports = new Type('tag:yaml.org,2002:js/regexp', {
    kind: 'scalar',
    resolve: resolveJavascriptRegExp,
    construct: constructJavascriptRegExp,
    predicate: isRegExp,
    represent: representJavascriptRegExp
});
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/js/function.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var esprima;
// Browserified version does not have esprima
//
// 1. For node.js just require module as deps
// 2. For browser try to require mudule via external AMD system.
//    If not found - try to fallback to window.esprima. If not
//    found too - then fail to parse.
//
try {
    // workaround to exclude package from browserify list.
    var _require = /*TURBOPACK member replacement*/ __turbopack_context__.t;
    esprima = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/esprima@4.0.1/node_modules/esprima/dist/esprima.js [instrumentation] (ecmascript)");
} catch (_) {
    /* eslint-disable no-redeclare */ /* global window */ if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
}
var Type = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type.js [instrumentation] (ecmascript)");
function resolveJavascriptFunction(data) {
    if (data === null) return false;
    try {
        var source = '(' + data + ')', ast = esprima.parse(source, {
            range: true
        });
        if (ast.type !== 'Program' || ast.body.length !== 1 || ast.body[0].type !== 'ExpressionStatement' || ast.body[0].expression.type !== 'ArrowFunctionExpression' && ast.body[0].expression.type !== 'FunctionExpression') {
            return false;
        }
        return true;
    } catch (err) {
        return false;
    }
}
function constructJavascriptFunction(data) {
    /*jslint evil:true*/ var source = '(' + data + ')', ast = esprima.parse(source, {
        range: true
    }), params = [], body;
    if (ast.type !== 'Program' || ast.body.length !== 1 || ast.body[0].type !== 'ExpressionStatement' || ast.body[0].expression.type !== 'ArrowFunctionExpression' && ast.body[0].expression.type !== 'FunctionExpression') {
        throw new Error('Failed to resolve function');
    }
    ast.body[0].expression.params.forEach(function(param) {
        params.push(param.name);
    });
    body = ast.body[0].expression.body.range;
    // Esprima's ranges include the first '{' and the last '}' characters on
    // function expressions. So cut them out.
    if (ast.body[0].expression.body.type === 'BlockStatement') {
        /*eslint-disable no-new-func*/ return new Function(params, source.slice(body[0] + 1, body[1] - 1));
    }
    // ES6 arrow functions can omit the BlockStatement. In that case, just return
    // the body.
    /*eslint-disable no-new-func*/ return new Function(params, 'return ' + source.slice(body[0], body[1]));
}
function representJavascriptFunction(object /*, style*/ ) {
    return object.toString();
}
function isFunction(object) {
    return Object.prototype.toString.call(object) === '[object Function]';
}
module.exports = new Type('tag:yaml.org,2002:js/function', {
    kind: 'scalar',
    resolve: resolveJavascriptFunction,
    construct: constructJavascriptFunction,
    predicate: isFunction,
    represent: representJavascriptFunction
});
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/schema/default_full.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

// JS-YAML's default schema for `load` function.
// It is not described in the YAML specification.
//
// This schema is based on JS-YAML's default safe schema and includes
// JavaScript-specific types: !!js/undefined, !!js/regexp and !!js/function.
//
// Also this schema is used as default base schema at `Schema.create` function.
var Schema = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/schema.js [instrumentation] (ecmascript)");
module.exports = Schema.DEFAULT = new Schema({
    include: [
        __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/schema/default_safe.js [instrumentation] (ecmascript)")
    ],
    explicit: [
        __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/js/undefined.js [instrumentation] (ecmascript)"),
        __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/js/regexp.js [instrumentation] (ecmascript)"),
        __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type/js/function.js [instrumentation] (ecmascript)")
    ]
});
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/mark.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var common = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/common.js [instrumentation] (ecmascript)");
function Mark(name, buffer, position, line, column) {
    this.name = name;
    this.buffer = buffer;
    this.position = position;
    this.line = line;
    this.column = column;
}
Mark.prototype.getSnippet = function getSnippet(indent, maxLength) {
    var head, start, tail, end, snippet;
    if (!this.buffer) return null;
    indent = indent || 4;
    maxLength = maxLength || 75;
    head = '';
    start = this.position;
    while(start > 0 && '\x00\r\n\x85\u2028\u2029'.indexOf(this.buffer.charAt(start - 1)) === -1){
        start -= 1;
        if (this.position - start > maxLength / 2 - 1) {
            head = ' ... ';
            start += 5;
            break;
        }
    }
    tail = '';
    end = this.position;
    while(end < this.buffer.length && '\x00\r\n\x85\u2028\u2029'.indexOf(this.buffer.charAt(end)) === -1){
        end += 1;
        if (end - this.position > maxLength / 2 - 1) {
            tail = ' ... ';
            end -= 5;
            break;
        }
    }
    snippet = this.buffer.slice(start, end);
    return common.repeat(' ', indent) + head + snippet + tail + '\n' + common.repeat(' ', indent + this.position - start + head.length) + '^';
};
Mark.prototype.toString = function toString(compact) {
    var snippet, where = '';
    if (this.name) {
        where += 'in "' + this.name + '" ';
    }
    where += 'at line ' + (this.line + 1) + ', column ' + (this.column + 1);
    if (!compact) {
        snippet = this.getSnippet();
        if (snippet) {
            where += ':\n' + snippet;
        }
    }
    return where;
};
module.exports = Mark;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/loader.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

/*eslint-disable max-len,no-use-before-define*/ var common = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/common.js [instrumentation] (ecmascript)");
var YAMLException = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/exception.js [instrumentation] (ecmascript)");
var Mark = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/mark.js [instrumentation] (ecmascript)");
var DEFAULT_SAFE_SCHEMA = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/schema/default_safe.js [instrumentation] (ecmascript)");
var DEFAULT_FULL_SCHEMA = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/schema/default_full.js [instrumentation] (ecmascript)");
var _hasOwnProperty = Object.prototype.hasOwnProperty;
var CONTEXT_FLOW_IN = 1;
var CONTEXT_FLOW_OUT = 2;
var CONTEXT_BLOCK_IN = 3;
var CONTEXT_BLOCK_OUT = 4;
var CHOMPING_CLIP = 1;
var CHOMPING_STRIP = 2;
var CHOMPING_KEEP = 3;
var PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
var PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
var PATTERN_FLOW_INDICATORS = /[,\[\]\{\}]/;
var PATTERN_TAG_HANDLE = /^(?:!|!!|![a-z\-]+!)$/i;
var PATTERN_TAG_URI = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
function _class(obj) {
    return Object.prototype.toString.call(obj);
}
function is_EOL(c) {
    return c === 0x0A /* LF */  || c === 0x0D /* CR */ ;
}
function is_WHITE_SPACE(c) {
    return c === 0x09 /* Tab */  || c === 0x20 /* Space */ ;
}
function is_WS_OR_EOL(c) {
    return c === 0x09 /* Tab */  || c === 0x20 /* Space */  || c === 0x0A /* LF */  || c === 0x0D /* CR */ ;
}
function is_FLOW_INDICATOR(c) {
    return c === 0x2C /* , */  || c === 0x5B /* [ */  || c === 0x5D /* ] */  || c === 0x7B /* { */  || c === 0x7D /* } */ ;
}
function fromHexCode(c) {
    var lc;
    if (0x30 /* 0 */  <= c && c <= 0x39 /* 9 */ ) {
        return c - 0x30;
    }
    /*eslint-disable no-bitwise*/ lc = c | 0x20;
    if (0x61 /* a */  <= lc && lc <= 0x66 /* f */ ) {
        return lc - 0x61 + 10;
    }
    return -1;
}
function escapedHexLen(c) {
    if (c === 0x78 /* x */ ) {
        return 2;
    }
    if (c === 0x75 /* u */ ) {
        return 4;
    }
    if (c === 0x55 /* U */ ) {
        return 8;
    }
    return 0;
}
function fromDecimalCode(c) {
    if (0x30 /* 0 */  <= c && c <= 0x39 /* 9 */ ) {
        return c - 0x30;
    }
    return -1;
}
function simpleEscapeSequence(c) {
    /* eslint-disable indent */ return c === 0x30 /* 0 */  ? '\x00' : c === 0x61 /* a */  ? '\x07' : c === 0x62 /* b */  ? '\x08' : c === 0x74 /* t */  ? '\x09' : c === 0x09 /* Tab */  ? '\x09' : c === 0x6E /* n */  ? '\x0A' : c === 0x76 /* v */  ? '\x0B' : c === 0x66 /* f */  ? '\x0C' : c === 0x72 /* r */  ? '\x0D' : c === 0x65 /* e */  ? '\x1B' : c === 0x20 /* Space */  ? ' ' : c === 0x22 /* " */  ? '\x22' : c === 0x2F /* / */  ? '/' : c === 0x5C /* \ */  ? '\x5C' : c === 0x4E /* N */  ? '\x85' : c === 0x5F /* _ */  ? '\xA0' : c === 0x4C /* L */  ? '\u2028' : c === 0x50 /* P */  ? '\u2029' : '';
}
function charFromCodepoint(c) {
    if (c <= 0xFFFF) {
        return String.fromCharCode(c);
    }
    // Encode UTF-16 surrogate pair
    // https://en.wikipedia.org/wiki/UTF-16#Code_points_U.2B010000_to_U.2B10FFFF
    return String.fromCharCode((c - 0x010000 >> 10) + 0xD800, (c - 0x010000 & 0x03FF) + 0xDC00);
}
// set a property of a literal object, while protecting against prototype pollution,
// see https://github.com/nodeca/js-yaml/issues/164 for more details
function setProperty(object, key, value) {
    // used for this specific key only because Object.defineProperty is slow
    if (key === '__proto__') {
        Object.defineProperty(object, key, {
            configurable: true,
            enumerable: true,
            writable: true,
            value: value
        });
    } else {
        object[key] = value;
    }
}
var simpleEscapeCheck = new Array(256); // integer, for fast access
var simpleEscapeMap = new Array(256);
for(var i = 0; i < 256; i++){
    simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
    simpleEscapeMap[i] = simpleEscapeSequence(i);
}
function State(input, options) {
    this.input = input;
    this.filename = options['filename'] || null;
    this.schema = options['schema'] || DEFAULT_FULL_SCHEMA;
    this.onWarning = options['onWarning'] || null;
    this.legacy = options['legacy'] || false;
    this.json = options['json'] || false;
    this.listener = options['listener'] || null;
    this.implicitTypes = this.schema.compiledImplicit;
    this.typeMap = this.schema.compiledTypeMap;
    this.length = input.length;
    this.position = 0;
    this.line = 0;
    this.lineStart = 0;
    this.lineIndent = 0;
    this.documents = [];
/*
  this.version;
  this.checkLineBreaks;
  this.tagMap;
  this.anchorMap;
  this.tag;
  this.anchor;
  this.kind;
  this.result;*/ }
function generateError(state, message) {
    return new YAMLException(message, new Mark(state.filename, state.input, state.position, state.line, state.position - state.lineStart));
}
function throwError(state, message) {
    throw generateError(state, message);
}
function throwWarning(state, message) {
    if (state.onWarning) {
        state.onWarning.call(null, generateError(state, message));
    }
}
var directiveHandlers = {
    YAML: function handleYamlDirective(state, name, args) {
        var match, major, minor;
        if (state.version !== null) {
            throwError(state, 'duplication of %YAML directive');
        }
        if (args.length !== 1) {
            throwError(state, 'YAML directive accepts exactly one argument');
        }
        match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
        if (match === null) {
            throwError(state, 'ill-formed argument of the YAML directive');
        }
        major = parseInt(match[1], 10);
        minor = parseInt(match[2], 10);
        if (major !== 1) {
            throwError(state, 'unacceptable YAML version of the document');
        }
        state.version = args[0];
        state.checkLineBreaks = minor < 2;
        if (minor !== 1 && minor !== 2) {
            throwWarning(state, 'unsupported YAML version of the document');
        }
    },
    TAG: function handleTagDirective(state, name, args) {
        var handle, prefix;
        if (args.length !== 2) {
            throwError(state, 'TAG directive accepts exactly two arguments');
        }
        handle = args[0];
        prefix = args[1];
        if (!PATTERN_TAG_HANDLE.test(handle)) {
            throwError(state, 'ill-formed tag handle (first argument) of the TAG directive');
        }
        if (_hasOwnProperty.call(state.tagMap, handle)) {
            throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
        }
        if (!PATTERN_TAG_URI.test(prefix)) {
            throwError(state, 'ill-formed tag prefix (second argument) of the TAG directive');
        }
        state.tagMap[handle] = prefix;
    }
};
function captureSegment(state, start, end, checkJson) {
    var _position, _length, _character, _result;
    if (start < end) {
        _result = state.input.slice(start, end);
        if (checkJson) {
            for(_position = 0, _length = _result.length; _position < _length; _position += 1){
                _character = _result.charCodeAt(_position);
                if (!(_character === 0x09 || 0x20 <= _character && _character <= 0x10FFFF)) {
                    throwError(state, 'expected valid JSON character');
                }
            }
        } else if (PATTERN_NON_PRINTABLE.test(_result)) {
            throwError(state, 'the stream contains non-printable characters');
        }
        state.result += _result;
    }
}
function mergeMappings(state, destination, source, overridableKeys) {
    var sourceKeys, key, index, quantity;
    if (!common.isObject(source)) {
        throwError(state, 'cannot merge mappings; the provided source object is unacceptable');
    }
    sourceKeys = Object.keys(source);
    for(index = 0, quantity = sourceKeys.length; index < quantity; index += 1){
        key = sourceKeys[index];
        if (!_hasOwnProperty.call(destination, key)) {
            setProperty(destination, key, source[key]);
            overridableKeys[key] = true;
        }
    }
}
function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startPos) {
    var index, quantity;
    // The output is a plain object here, so keys can only be strings.
    // We need to convert keyNode to a string, but doing so can hang the process
    // (deeply nested arrays that explode exponentially using aliases).
    if (Array.isArray(keyNode)) {
        keyNode = Array.prototype.slice.call(keyNode);
        for(index = 0, quantity = keyNode.length; index < quantity; index += 1){
            if (Array.isArray(keyNode[index])) {
                throwError(state, 'nested arrays are not supported inside keys');
            }
            if (typeof keyNode === 'object' && _class(keyNode[index]) === '[object Object]') {
                keyNode[index] = '[object Object]';
            }
        }
    }
    // Avoid code execution in load() via toString property
    // (still use its own toString for arrays, timestamps,
    // and whatever user schema extensions happen to have @@toStringTag)
    if (typeof keyNode === 'object' && _class(keyNode) === '[object Object]') {
        keyNode = '[object Object]';
    }
    keyNode = String(keyNode);
    if (_result === null) {
        _result = {};
    }
    if (keyTag === 'tag:yaml.org,2002:merge') {
        if (Array.isArray(valueNode)) {
            for(index = 0, quantity = valueNode.length; index < quantity; index += 1){
                mergeMappings(state, _result, valueNode[index], overridableKeys);
            }
        } else {
            mergeMappings(state, _result, valueNode, overridableKeys);
        }
    } else {
        if (!state.json && !_hasOwnProperty.call(overridableKeys, keyNode) && _hasOwnProperty.call(_result, keyNode)) {
            state.line = startLine || state.line;
            state.position = startPos || state.position;
            throwError(state, 'duplicated mapping key');
        }
        setProperty(_result, keyNode, valueNode);
        delete overridableKeys[keyNode];
    }
    return _result;
}
function readLineBreak(state) {
    var ch;
    ch = state.input.charCodeAt(state.position);
    if (ch === 0x0A /* LF */ ) {
        state.position++;
    } else if (ch === 0x0D /* CR */ ) {
        state.position++;
        if (state.input.charCodeAt(state.position) === 0x0A /* LF */ ) {
            state.position++;
        }
    } else {
        throwError(state, 'a line break is expected');
    }
    state.line += 1;
    state.lineStart = state.position;
}
function skipSeparationSpace(state, allowComments, checkIndent) {
    var lineBreaks = 0, ch = state.input.charCodeAt(state.position);
    while(ch !== 0){
        while(is_WHITE_SPACE(ch)){
            ch = state.input.charCodeAt(++state.position);
        }
        if (allowComments && ch === 0x23 /* # */ ) {
            do {
                ch = state.input.charCodeAt(++state.position);
            }while (ch !== 0x0A /* LF */  && ch !== 0x0D /* CR */  && ch !== 0)
        }
        if (is_EOL(ch)) {
            readLineBreak(state);
            ch = state.input.charCodeAt(state.position);
            lineBreaks++;
            state.lineIndent = 0;
            while(ch === 0x20 /* Space */ ){
                state.lineIndent++;
                ch = state.input.charCodeAt(++state.position);
            }
        } else {
            break;
        }
    }
    if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
        throwWarning(state, 'deficient indentation');
    }
    return lineBreaks;
}
function testDocumentSeparator(state) {
    var _position = state.position, ch;
    ch = state.input.charCodeAt(_position);
    // Condition state.position === state.lineStart is tested
    // in parent on each call, for efficiency. No needs to test here again.
    if ((ch === 0x2D /* - */  || ch === 0x2E /* . */ ) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
        _position += 3;
        ch = state.input.charCodeAt(_position);
        if (ch === 0 || is_WS_OR_EOL(ch)) {
            return true;
        }
    }
    return false;
}
function writeFoldedLines(state, count) {
    if (count === 1) {
        state.result += ' ';
    } else if (count > 1) {
        state.result += common.repeat('\n', count - 1);
    }
}
function readPlainScalar(state, nodeIndent, withinFlowCollection) {
    var preceding, following, captureStart, captureEnd, hasPendingContent, _line, _lineStart, _lineIndent, _kind = state.kind, _result = state.result, ch;
    ch = state.input.charCodeAt(state.position);
    if (is_WS_OR_EOL(ch) || is_FLOW_INDICATOR(ch) || ch === 0x23 /* # */  || ch === 0x26 /* & */  || ch === 0x2A /* * */  || ch === 0x21 /* ! */  || ch === 0x7C /* | */  || ch === 0x3E /* > */  || ch === 0x27 /* ' */  || ch === 0x22 /* " */  || ch === 0x25 /* % */  || ch === 0x40 /* @ */  || ch === 0x60 /* ` */ ) {
        return false;
    }
    if (ch === 0x3F /* ? */  || ch === 0x2D /* - */ ) {
        following = state.input.charCodeAt(state.position + 1);
        if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
            return false;
        }
    }
    state.kind = 'scalar';
    state.result = '';
    captureStart = captureEnd = state.position;
    hasPendingContent = false;
    while(ch !== 0){
        if (ch === 0x3A /* : */ ) {
            following = state.input.charCodeAt(state.position + 1);
            if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
                break;
            }
        } else if (ch === 0x23 /* # */ ) {
            preceding = state.input.charCodeAt(state.position - 1);
            if (is_WS_OR_EOL(preceding)) {
                break;
            }
        } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && is_FLOW_INDICATOR(ch)) {
            break;
        } else if (is_EOL(ch)) {
            _line = state.line;
            _lineStart = state.lineStart;
            _lineIndent = state.lineIndent;
            skipSeparationSpace(state, false, -1);
            if (state.lineIndent >= nodeIndent) {
                hasPendingContent = true;
                ch = state.input.charCodeAt(state.position);
                continue;
            } else {
                state.position = captureEnd;
                state.line = _line;
                state.lineStart = _lineStart;
                state.lineIndent = _lineIndent;
                break;
            }
        }
        if (hasPendingContent) {
            captureSegment(state, captureStart, captureEnd, false);
            writeFoldedLines(state, state.line - _line);
            captureStart = captureEnd = state.position;
            hasPendingContent = false;
        }
        if (!is_WHITE_SPACE(ch)) {
            captureEnd = state.position + 1;
        }
        ch = state.input.charCodeAt(++state.position);
    }
    captureSegment(state, captureStart, captureEnd, false);
    if (state.result) {
        return true;
    }
    state.kind = _kind;
    state.result = _result;
    return false;
}
function readSingleQuotedScalar(state, nodeIndent) {
    var ch, captureStart, captureEnd;
    ch = state.input.charCodeAt(state.position);
    if (ch !== 0x27 /* ' */ ) {
        return false;
    }
    state.kind = 'scalar';
    state.result = '';
    state.position++;
    captureStart = captureEnd = state.position;
    while((ch = state.input.charCodeAt(state.position)) !== 0){
        if (ch === 0x27 /* ' */ ) {
            captureSegment(state, captureStart, state.position, true);
            ch = state.input.charCodeAt(++state.position);
            if (ch === 0x27 /* ' */ ) {
                captureStart = state.position;
                state.position++;
                captureEnd = state.position;
            } else {
                return true;
            }
        } else if (is_EOL(ch)) {
            captureSegment(state, captureStart, captureEnd, true);
            writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
            captureStart = captureEnd = state.position;
        } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
            throwError(state, 'unexpected end of the document within a single quoted scalar');
        } else {
            state.position++;
            captureEnd = state.position;
        }
    }
    throwError(state, 'unexpected end of the stream within a single quoted scalar');
}
function readDoubleQuotedScalar(state, nodeIndent) {
    var captureStart, captureEnd, hexLength, hexResult, tmp, ch;
    ch = state.input.charCodeAt(state.position);
    if (ch !== 0x22 /* " */ ) {
        return false;
    }
    state.kind = 'scalar';
    state.result = '';
    state.position++;
    captureStart = captureEnd = state.position;
    while((ch = state.input.charCodeAt(state.position)) !== 0){
        if (ch === 0x22 /* " */ ) {
            captureSegment(state, captureStart, state.position, true);
            state.position++;
            return true;
        } else if (ch === 0x5C /* \ */ ) {
            captureSegment(state, captureStart, state.position, true);
            ch = state.input.charCodeAt(++state.position);
            if (is_EOL(ch)) {
                skipSeparationSpace(state, false, nodeIndent);
            // TODO: rework to inline fn with no type cast?
            } else if (ch < 256 && simpleEscapeCheck[ch]) {
                state.result += simpleEscapeMap[ch];
                state.position++;
            } else if ((tmp = escapedHexLen(ch)) > 0) {
                hexLength = tmp;
                hexResult = 0;
                for(; hexLength > 0; hexLength--){
                    ch = state.input.charCodeAt(++state.position);
                    if ((tmp = fromHexCode(ch)) >= 0) {
                        hexResult = (hexResult << 4) + tmp;
                    } else {
                        throwError(state, 'expected hexadecimal character');
                    }
                }
                state.result += charFromCodepoint(hexResult);
                state.position++;
            } else {
                throwError(state, 'unknown escape sequence');
            }
            captureStart = captureEnd = state.position;
        } else if (is_EOL(ch)) {
            captureSegment(state, captureStart, captureEnd, true);
            writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
            captureStart = captureEnd = state.position;
        } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
            throwError(state, 'unexpected end of the document within a double quoted scalar');
        } else {
            state.position++;
            captureEnd = state.position;
        }
    }
    throwError(state, 'unexpected end of the stream within a double quoted scalar');
}
function readFlowCollection(state, nodeIndent) {
    var readNext = true, _line, _tag = state.tag, _result, _anchor = state.anchor, following, terminator, isPair, isExplicitPair, isMapping, overridableKeys = {}, keyNode, keyTag, valueNode, ch;
    ch = state.input.charCodeAt(state.position);
    if (ch === 0x5B /* [ */ ) {
        terminator = 0x5D; /* ] */ 
        isMapping = false;
        _result = [];
    } else if (ch === 0x7B /* { */ ) {
        terminator = 0x7D; /* } */ 
        isMapping = true;
        _result = {};
    } else {
        return false;
    }
    if (state.anchor !== null) {
        state.anchorMap[state.anchor] = _result;
    }
    ch = state.input.charCodeAt(++state.position);
    while(ch !== 0){
        skipSeparationSpace(state, true, nodeIndent);
        ch = state.input.charCodeAt(state.position);
        if (ch === terminator) {
            state.position++;
            state.tag = _tag;
            state.anchor = _anchor;
            state.kind = isMapping ? 'mapping' : 'sequence';
            state.result = _result;
            return true;
        } else if (!readNext) {
            throwError(state, 'missed comma between flow collection entries');
        }
        keyTag = keyNode = valueNode = null;
        isPair = isExplicitPair = false;
        if (ch === 0x3F /* ? */ ) {
            following = state.input.charCodeAt(state.position + 1);
            if (is_WS_OR_EOL(following)) {
                isPair = isExplicitPair = true;
                state.position++;
                skipSeparationSpace(state, true, nodeIndent);
            }
        }
        _line = state.line;
        composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
        keyTag = state.tag;
        keyNode = state.result;
        skipSeparationSpace(state, true, nodeIndent);
        ch = state.input.charCodeAt(state.position);
        if ((isExplicitPair || state.line === _line) && ch === 0x3A /* : */ ) {
            isPair = true;
            ch = state.input.charCodeAt(++state.position);
            skipSeparationSpace(state, true, nodeIndent);
            composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
            valueNode = state.result;
        }
        if (isMapping) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode);
        } else if (isPair) {
            _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode));
        } else {
            _result.push(keyNode);
        }
        skipSeparationSpace(state, true, nodeIndent);
        ch = state.input.charCodeAt(state.position);
        if (ch === 0x2C /* , */ ) {
            readNext = true;
            ch = state.input.charCodeAt(++state.position);
        } else {
            readNext = false;
        }
    }
    throwError(state, 'unexpected end of the stream within a flow collection');
}
function readBlockScalar(state, nodeIndent) {
    var captureStart, folding, chomping = CHOMPING_CLIP, didReadContent = false, detectedIndent = false, textIndent = nodeIndent, emptyLines = 0, atMoreIndented = false, tmp, ch;
    ch = state.input.charCodeAt(state.position);
    if (ch === 0x7C /* | */ ) {
        folding = false;
    } else if (ch === 0x3E /* > */ ) {
        folding = true;
    } else {
        return false;
    }
    state.kind = 'scalar';
    state.result = '';
    while(ch !== 0){
        ch = state.input.charCodeAt(++state.position);
        if (ch === 0x2B /* + */  || ch === 0x2D /* - */ ) {
            if (CHOMPING_CLIP === chomping) {
                chomping = ch === 0x2B /* + */  ? CHOMPING_KEEP : CHOMPING_STRIP;
            } else {
                throwError(state, 'repeat of a chomping mode identifier');
            }
        } else if ((tmp = fromDecimalCode(ch)) >= 0) {
            if (tmp === 0) {
                throwError(state, 'bad explicit indentation width of a block scalar; it cannot be less than one');
            } else if (!detectedIndent) {
                textIndent = nodeIndent + tmp - 1;
                detectedIndent = true;
            } else {
                throwError(state, 'repeat of an indentation width identifier');
            }
        } else {
            break;
        }
    }
    if (is_WHITE_SPACE(ch)) {
        do {
            ch = state.input.charCodeAt(++state.position);
        }while (is_WHITE_SPACE(ch))
        if (ch === 0x23 /* # */ ) {
            do {
                ch = state.input.charCodeAt(++state.position);
            }while (!is_EOL(ch) && ch !== 0)
        }
    }
    while(ch !== 0){
        readLineBreak(state);
        state.lineIndent = 0;
        ch = state.input.charCodeAt(state.position);
        while((!detectedIndent || state.lineIndent < textIndent) && ch === 0x20 /* Space */ ){
            state.lineIndent++;
            ch = state.input.charCodeAt(++state.position);
        }
        if (!detectedIndent && state.lineIndent > textIndent) {
            textIndent = state.lineIndent;
        }
        if (is_EOL(ch)) {
            emptyLines++;
            continue;
        }
        // End of the scalar.
        if (state.lineIndent < textIndent) {
            // Perform the chomping.
            if (chomping === CHOMPING_KEEP) {
                state.result += common.repeat('\n', didReadContent ? 1 + emptyLines : emptyLines);
            } else if (chomping === CHOMPING_CLIP) {
                if (didReadContent) {
                    state.result += '\n';
                }
            }
            break;
        }
        // Folded style: use fancy rules to handle line breaks.
        if (folding) {
            // Lines starting with white space characters (more-indented lines) are not folded.
            if (is_WHITE_SPACE(ch)) {
                atMoreIndented = true;
                // except for the first content line (cf. Example 8.1)
                state.result += common.repeat('\n', didReadContent ? 1 + emptyLines : emptyLines);
            // End of more-indented block.
            } else if (atMoreIndented) {
                atMoreIndented = false;
                state.result += common.repeat('\n', emptyLines + 1);
            // Just one line break - perceive as the same line.
            } else if (emptyLines === 0) {
                if (didReadContent) {
                    state.result += ' ';
                }
            // Several line breaks - perceive as different lines.
            } else {
                state.result += common.repeat('\n', emptyLines);
            }
        // Literal style: just add exact number of line breaks between content lines.
        } else {
            // Keep all line breaks except the header line break.
            state.result += common.repeat('\n', didReadContent ? 1 + emptyLines : emptyLines);
        }
        didReadContent = true;
        detectedIndent = true;
        emptyLines = 0;
        captureStart = state.position;
        while(!is_EOL(ch) && ch !== 0){
            ch = state.input.charCodeAt(++state.position);
        }
        captureSegment(state, captureStart, state.position, false);
    }
    return true;
}
function readBlockSequence(state, nodeIndent) {
    var _line, _tag = state.tag, _anchor = state.anchor, _result = [], following, detected = false, ch;
    if (state.anchor !== null) {
        state.anchorMap[state.anchor] = _result;
    }
    ch = state.input.charCodeAt(state.position);
    while(ch !== 0){
        if (ch !== 0x2D /* - */ ) {
            break;
        }
        following = state.input.charCodeAt(state.position + 1);
        if (!is_WS_OR_EOL(following)) {
            break;
        }
        detected = true;
        state.position++;
        if (skipSeparationSpace(state, true, -1)) {
            if (state.lineIndent <= nodeIndent) {
                _result.push(null);
                ch = state.input.charCodeAt(state.position);
                continue;
            }
        }
        _line = state.line;
        composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
        _result.push(state.result);
        skipSeparationSpace(state, true, -1);
        ch = state.input.charCodeAt(state.position);
        if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
            throwError(state, 'bad indentation of a sequence entry');
        } else if (state.lineIndent < nodeIndent) {
            break;
        }
    }
    if (detected) {
        state.tag = _tag;
        state.anchor = _anchor;
        state.kind = 'sequence';
        state.result = _result;
        return true;
    }
    return false;
}
function readBlockMapping(state, nodeIndent, flowIndent) {
    var following, allowCompact, _line, _pos, _tag = state.tag, _anchor = state.anchor, _result = {}, overridableKeys = {}, keyTag = null, keyNode = null, valueNode = null, atExplicitKey = false, detected = false, ch;
    if (state.anchor !== null) {
        state.anchorMap[state.anchor] = _result;
    }
    ch = state.input.charCodeAt(state.position);
    while(ch !== 0){
        following = state.input.charCodeAt(state.position + 1);
        _line = state.line; // Save the current line.
        _pos = state.position;
        //
        // Explicit notation case. There are two separate blocks:
        // first for the key (denoted by "?") and second for the value (denoted by ":")
        //
        if ((ch === 0x3F /* ? */  || ch === 0x3A /* : */ ) && is_WS_OR_EOL(following)) {
            if (ch === 0x3F /* ? */ ) {
                if (atExplicitKey) {
                    storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null);
                    keyTag = keyNode = valueNode = null;
                }
                detected = true;
                atExplicitKey = true;
                allowCompact = true;
            } else if (atExplicitKey) {
                // i.e. 0x3A/* : */ === character after the explicit key.
                atExplicitKey = false;
                allowCompact = true;
            } else {
                throwError(state, 'incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line');
            }
            state.position += 1;
            ch = following;
        //
        // Implicit notation case. Flow-style node as the key first, then ":", and the value.
        //
        } else if (composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
            if (state.line === _line) {
                ch = state.input.charCodeAt(state.position);
                while(is_WHITE_SPACE(ch)){
                    ch = state.input.charCodeAt(++state.position);
                }
                if (ch === 0x3A /* : */ ) {
                    ch = state.input.charCodeAt(++state.position);
                    if (!is_WS_OR_EOL(ch)) {
                        throwError(state, 'a whitespace character is expected after the key-value separator within a block mapping');
                    }
                    if (atExplicitKey) {
                        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null);
                        keyTag = keyNode = valueNode = null;
                    }
                    detected = true;
                    atExplicitKey = false;
                    allowCompact = false;
                    keyTag = state.tag;
                    keyNode = state.result;
                } else if (detected) {
                    throwError(state, 'can not read an implicit mapping pair; a colon is missed');
                } else {
                    state.tag = _tag;
                    state.anchor = _anchor;
                    return true; // Keep the result of `composeNode`.
                }
            } else if (detected) {
                throwError(state, 'can not read a block mapping entry; a multiline key may not be an implicit key');
            } else {
                state.tag = _tag;
                state.anchor = _anchor;
                return true; // Keep the result of `composeNode`.
            }
        } else {
            break; // Reading is done. Go to the epilogue.
        }
        //
        // Common reading code for both explicit and implicit notations.
        //
        if (state.line === _line || state.lineIndent > nodeIndent) {
            if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
                if (atExplicitKey) {
                    keyNode = state.result;
                } else {
                    valueNode = state.result;
                }
            }
            if (!atExplicitKey) {
                storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _pos);
                keyTag = keyNode = valueNode = null;
            }
            skipSeparationSpace(state, true, -1);
            ch = state.input.charCodeAt(state.position);
        }
        if (state.lineIndent > nodeIndent && ch !== 0) {
            throwError(state, 'bad indentation of a mapping entry');
        } else if (state.lineIndent < nodeIndent) {
            break;
        }
    }
    //
    // Epilogue.
    //
    // Special case: last mapping's node contains only the key in explicit notation.
    if (atExplicitKey) {
        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null);
    }
    // Expose the resulting mapping.
    if (detected) {
        state.tag = _tag;
        state.anchor = _anchor;
        state.kind = 'mapping';
        state.result = _result;
    }
    return detected;
}
function readTagProperty(state) {
    var _position, isVerbatim = false, isNamed = false, tagHandle, tagName, ch;
    ch = state.input.charCodeAt(state.position);
    if (ch !== 0x21 /* ! */ ) return false;
    if (state.tag !== null) {
        throwError(state, 'duplication of a tag property');
    }
    ch = state.input.charCodeAt(++state.position);
    if (ch === 0x3C /* < */ ) {
        isVerbatim = true;
        ch = state.input.charCodeAt(++state.position);
    } else if (ch === 0x21 /* ! */ ) {
        isNamed = true;
        tagHandle = '!!';
        ch = state.input.charCodeAt(++state.position);
    } else {
        tagHandle = '!';
    }
    _position = state.position;
    if (isVerbatim) {
        do {
            ch = state.input.charCodeAt(++state.position);
        }while (ch !== 0 && ch !== 0x3E /* > */ )
        if (state.position < state.length) {
            tagName = state.input.slice(_position, state.position);
            ch = state.input.charCodeAt(++state.position);
        } else {
            throwError(state, 'unexpected end of the stream within a verbatim tag');
        }
    } else {
        while(ch !== 0 && !is_WS_OR_EOL(ch)){
            if (ch === 0x21 /* ! */ ) {
                if (!isNamed) {
                    tagHandle = state.input.slice(_position - 1, state.position + 1);
                    if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
                        throwError(state, 'named tag handle cannot contain such characters');
                    }
                    isNamed = true;
                    _position = state.position + 1;
                } else {
                    throwError(state, 'tag suffix cannot contain exclamation marks');
                }
            }
            ch = state.input.charCodeAt(++state.position);
        }
        tagName = state.input.slice(_position, state.position);
        if (PATTERN_FLOW_INDICATORS.test(tagName)) {
            throwError(state, 'tag suffix cannot contain flow indicator characters');
        }
    }
    if (tagName && !PATTERN_TAG_URI.test(tagName)) {
        throwError(state, 'tag name cannot contain such characters: ' + tagName);
    }
    if (isVerbatim) {
        state.tag = tagName;
    } else if (_hasOwnProperty.call(state.tagMap, tagHandle)) {
        state.tag = state.tagMap[tagHandle] + tagName;
    } else if (tagHandle === '!') {
        state.tag = '!' + tagName;
    } else if (tagHandle === '!!') {
        state.tag = 'tag:yaml.org,2002:' + tagName;
    } else {
        throwError(state, 'undeclared tag handle "' + tagHandle + '"');
    }
    return true;
}
function readAnchorProperty(state) {
    var _position, ch;
    ch = state.input.charCodeAt(state.position);
    if (ch !== 0x26 /* & */ ) return false;
    if (state.anchor !== null) {
        throwError(state, 'duplication of an anchor property');
    }
    ch = state.input.charCodeAt(++state.position);
    _position = state.position;
    while(ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)){
        ch = state.input.charCodeAt(++state.position);
    }
    if (state.position === _position) {
        throwError(state, 'name of an anchor node must contain at least one character');
    }
    state.anchor = state.input.slice(_position, state.position);
    return true;
}
function readAlias(state) {
    var _position, alias, ch;
    ch = state.input.charCodeAt(state.position);
    if (ch !== 0x2A /* * */ ) return false;
    ch = state.input.charCodeAt(++state.position);
    _position = state.position;
    while(ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)){
        ch = state.input.charCodeAt(++state.position);
    }
    if (state.position === _position) {
        throwError(state, 'name of an alias node must contain at least one character');
    }
    alias = state.input.slice(_position, state.position);
    if (!_hasOwnProperty.call(state.anchorMap, alias)) {
        throwError(state, 'unidentified alias "' + alias + '"');
    }
    state.result = state.anchorMap[alias];
    skipSeparationSpace(state, true, -1);
    return true;
}
function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
    var allowBlockStyles, allowBlockScalars, allowBlockCollections, indentStatus = 1, atNewLine = false, hasContent = false, typeIndex, typeQuantity, type, flowIndent, blockIndent;
    if (state.listener !== null) {
        state.listener('open', state);
    }
    state.tag = null;
    state.anchor = null;
    state.kind = null;
    state.result = null;
    allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
    if (allowToSeek) {
        if (skipSeparationSpace(state, true, -1)) {
            atNewLine = true;
            if (state.lineIndent > parentIndent) {
                indentStatus = 1;
            } else if (state.lineIndent === parentIndent) {
                indentStatus = 0;
            } else if (state.lineIndent < parentIndent) {
                indentStatus = -1;
            }
        }
    }
    if (indentStatus === 1) {
        while(readTagProperty(state) || readAnchorProperty(state)){
            if (skipSeparationSpace(state, true, -1)) {
                atNewLine = true;
                allowBlockCollections = allowBlockStyles;
                if (state.lineIndent > parentIndent) {
                    indentStatus = 1;
                } else if (state.lineIndent === parentIndent) {
                    indentStatus = 0;
                } else if (state.lineIndent < parentIndent) {
                    indentStatus = -1;
                }
            } else {
                allowBlockCollections = false;
            }
        }
    }
    if (allowBlockCollections) {
        allowBlockCollections = atNewLine || allowCompact;
    }
    if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
        if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) {
            flowIndent = parentIndent;
        } else {
            flowIndent = parentIndent + 1;
        }
        blockIndent = state.position - state.lineStart;
        if (indentStatus === 1) {
            if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) {
                hasContent = true;
            } else {
                if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) {
                    hasContent = true;
                } else if (readAlias(state)) {
                    hasContent = true;
                    if (state.tag !== null || state.anchor !== null) {
                        throwError(state, 'alias node should not have any properties');
                    }
                } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
                    hasContent = true;
                    if (state.tag === null) {
                        state.tag = '?';
                    }
                }
                if (state.anchor !== null) {
                    state.anchorMap[state.anchor] = state.result;
                }
            }
        } else if (indentStatus === 0) {
            // Special case: block sequences are allowed to have same indentation level as the parent.
            // http://www.yaml.org/spec/1.2/spec.html#id2799784
            hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
        }
    }
    if (state.tag !== null && state.tag !== '!') {
        if (state.tag === '?') {
            // Implicit resolving is not allowed for non-scalar types, and '?'
            // non-specific tag is only automatically assigned to plain scalars.
            //
            // We only need to check kind conformity in case user explicitly assigns '?'
            // tag, for example like this: "!<?> [0]"
            //
            if (state.result !== null && state.kind !== 'scalar') {
                throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
            }
            for(typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1){
                type = state.implicitTypes[typeIndex];
                if (type.resolve(state.result)) {
                    state.result = type.construct(state.result);
                    state.tag = type.tag;
                    if (state.anchor !== null) {
                        state.anchorMap[state.anchor] = state.result;
                    }
                    break;
                }
            }
        } else if (_hasOwnProperty.call(state.typeMap[state.kind || 'fallback'], state.tag)) {
            type = state.typeMap[state.kind || 'fallback'][state.tag];
            if (state.result !== null && type.kind !== state.kind) {
                throwError(state, 'unacceptable node kind for !<' + state.tag + '> tag; it should be "' + type.kind + '", not "' + state.kind + '"');
            }
            if (!type.resolve(state.result)) {
                throwError(state, 'cannot resolve a node with !<' + state.tag + '> explicit tag');
            } else {
                state.result = type.construct(state.result);
                if (state.anchor !== null) {
                    state.anchorMap[state.anchor] = state.result;
                }
            }
        } else {
            throwError(state, 'unknown tag !<' + state.tag + '>');
        }
    }
    if (state.listener !== null) {
        state.listener('close', state);
    }
    return state.tag !== null || state.anchor !== null || hasContent;
}
function readDocument(state) {
    var documentStart = state.position, _position, directiveName, directiveArgs, hasDirectives = false, ch;
    state.version = null;
    state.checkLineBreaks = state.legacy;
    state.tagMap = {};
    state.anchorMap = {};
    while((ch = state.input.charCodeAt(state.position)) !== 0){
        skipSeparationSpace(state, true, -1);
        ch = state.input.charCodeAt(state.position);
        if (state.lineIndent > 0 || ch !== 0x25 /* % */ ) {
            break;
        }
        hasDirectives = true;
        ch = state.input.charCodeAt(++state.position);
        _position = state.position;
        while(ch !== 0 && !is_WS_OR_EOL(ch)){
            ch = state.input.charCodeAt(++state.position);
        }
        directiveName = state.input.slice(_position, state.position);
        directiveArgs = [];
        if (directiveName.length < 1) {
            throwError(state, 'directive name must not be less than one character in length');
        }
        while(ch !== 0){
            while(is_WHITE_SPACE(ch)){
                ch = state.input.charCodeAt(++state.position);
            }
            if (ch === 0x23 /* # */ ) {
                do {
                    ch = state.input.charCodeAt(++state.position);
                }while (ch !== 0 && !is_EOL(ch))
                break;
            }
            if (is_EOL(ch)) break;
            _position = state.position;
            while(ch !== 0 && !is_WS_OR_EOL(ch)){
                ch = state.input.charCodeAt(++state.position);
            }
            directiveArgs.push(state.input.slice(_position, state.position));
        }
        if (ch !== 0) readLineBreak(state);
        if (_hasOwnProperty.call(directiveHandlers, directiveName)) {
            directiveHandlers[directiveName](state, directiveName, directiveArgs);
        } else {
            throwWarning(state, 'unknown document directive "' + directiveName + '"');
        }
    }
    skipSeparationSpace(state, true, -1);
    if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 0x2D /* - */  && state.input.charCodeAt(state.position + 1) === 0x2D /* - */  && state.input.charCodeAt(state.position + 2) === 0x2D /* - */ ) {
        state.position += 3;
        skipSeparationSpace(state, true, -1);
    } else if (hasDirectives) {
        throwError(state, 'directives end mark is expected');
    }
    composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
    skipSeparationSpace(state, true, -1);
    if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
        throwWarning(state, 'non-ASCII line breaks are interpreted as content');
    }
    state.documents.push(state.result);
    if (state.position === state.lineStart && testDocumentSeparator(state)) {
        if (state.input.charCodeAt(state.position) === 0x2E /* . */ ) {
            state.position += 3;
            skipSeparationSpace(state, true, -1);
        }
        return;
    }
    if (state.position < state.length - 1) {
        throwError(state, 'end of the stream or a document separator is expected');
    } else {
        return;
    }
}
function loadDocuments(input, options) {
    input = String(input);
    options = options || {};
    if (input.length !== 0) {
        // Add tailing `\n` if not exists
        if (input.charCodeAt(input.length - 1) !== 0x0A /* LF */  && input.charCodeAt(input.length - 1) !== 0x0D /* CR */ ) {
            input += '\n';
        }
        // Strip BOM
        if (input.charCodeAt(0) === 0xFEFF) {
            input = input.slice(1);
        }
    }
    var state = new State(input, options);
    var nullpos = input.indexOf('\0');
    if (nullpos !== -1) {
        state.position = nullpos;
        throwError(state, 'null byte is not allowed in input');
    }
    // Use 0 as string terminator. That significantly simplifies bounds check.
    state.input += '\0';
    while(state.input.charCodeAt(state.position) === 0x20 /* Space */ ){
        state.lineIndent += 1;
        state.position += 1;
    }
    while(state.position < state.length - 1){
        readDocument(state);
    }
    return state.documents;
}
function loadAll(input, iterator, options) {
    if (iterator !== null && typeof iterator === 'object' && typeof options === 'undefined') {
        options = iterator;
        iterator = null;
    }
    var documents = loadDocuments(input, options);
    if (typeof iterator !== 'function') {
        return documents;
    }
    for(var index = 0, length = documents.length; index < length; index += 1){
        iterator(documents[index]);
    }
}
function load(input, options) {
    var documents = loadDocuments(input, options);
    if (documents.length === 0) {
        /*eslint-disable no-undefined*/ return undefined;
    } else if (documents.length === 1) {
        return documents[0];
    }
    throw new YAMLException('expected a single document in the stream, but found more');
}
function safeLoadAll(input, iterator, options) {
    if (typeof iterator === 'object' && iterator !== null && typeof options === 'undefined') {
        options = iterator;
        iterator = null;
    }
    return loadAll(input, iterator, common.extend({
        schema: DEFAULT_SAFE_SCHEMA
    }, options));
}
function safeLoad(input, options) {
    return load(input, common.extend({
        schema: DEFAULT_SAFE_SCHEMA
    }, options));
}
module.exports.loadAll = loadAll;
module.exports.load = load;
module.exports.safeLoadAll = safeLoadAll;
module.exports.safeLoad = safeLoad;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/dumper.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

/*eslint-disable no-use-before-define*/ var common = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/common.js [instrumentation] (ecmascript)");
var YAMLException = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/exception.js [instrumentation] (ecmascript)");
var DEFAULT_FULL_SCHEMA = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/schema/default_full.js [instrumentation] (ecmascript)");
var DEFAULT_SAFE_SCHEMA = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/schema/default_safe.js [instrumentation] (ecmascript)");
var _toString = Object.prototype.toString;
var _hasOwnProperty = Object.prototype.hasOwnProperty;
var CHAR_TAB = 0x09; /* Tab */ 
var CHAR_LINE_FEED = 0x0A; /* LF */ 
var CHAR_CARRIAGE_RETURN = 0x0D; /* CR */ 
var CHAR_SPACE = 0x20; /* Space */ 
var CHAR_EXCLAMATION = 0x21; /* ! */ 
var CHAR_DOUBLE_QUOTE = 0x22; /* " */ 
var CHAR_SHARP = 0x23; /* # */ 
var CHAR_PERCENT = 0x25; /* % */ 
var CHAR_AMPERSAND = 0x26; /* & */ 
var CHAR_SINGLE_QUOTE = 0x27; /* ' */ 
var CHAR_ASTERISK = 0x2A; /* * */ 
var CHAR_COMMA = 0x2C; /* , */ 
var CHAR_MINUS = 0x2D; /* - */ 
var CHAR_COLON = 0x3A; /* : */ 
var CHAR_EQUALS = 0x3D; /* = */ 
var CHAR_GREATER_THAN = 0x3E; /* > */ 
var CHAR_QUESTION = 0x3F; /* ? */ 
var CHAR_COMMERCIAL_AT = 0x40; /* @ */ 
var CHAR_LEFT_SQUARE_BRACKET = 0x5B; /* [ */ 
var CHAR_RIGHT_SQUARE_BRACKET = 0x5D; /* ] */ 
var CHAR_GRAVE_ACCENT = 0x60; /* ` */ 
var CHAR_LEFT_CURLY_BRACKET = 0x7B; /* { */ 
var CHAR_VERTICAL_LINE = 0x7C; /* | */ 
var CHAR_RIGHT_CURLY_BRACKET = 0x7D; /* } */ 
var ESCAPE_SEQUENCES = {};
ESCAPE_SEQUENCES[0x00] = '\\0';
ESCAPE_SEQUENCES[0x07] = '\\a';
ESCAPE_SEQUENCES[0x08] = '\\b';
ESCAPE_SEQUENCES[0x09] = '\\t';
ESCAPE_SEQUENCES[0x0A] = '\\n';
ESCAPE_SEQUENCES[0x0B] = '\\v';
ESCAPE_SEQUENCES[0x0C] = '\\f';
ESCAPE_SEQUENCES[0x0D] = '\\r';
ESCAPE_SEQUENCES[0x1B] = '\\e';
ESCAPE_SEQUENCES[0x22] = '\\"';
ESCAPE_SEQUENCES[0x5C] = '\\\\';
ESCAPE_SEQUENCES[0x85] = '\\N';
ESCAPE_SEQUENCES[0xA0] = '\\_';
ESCAPE_SEQUENCES[0x2028] = '\\L';
ESCAPE_SEQUENCES[0x2029] = '\\P';
var DEPRECATED_BOOLEANS_SYNTAX = [
    'y',
    'Y',
    'yes',
    'Yes',
    'YES',
    'on',
    'On',
    'ON',
    'n',
    'N',
    'no',
    'No',
    'NO',
    'off',
    'Off',
    'OFF'
];
function compileStyleMap(schema, map) {
    var result, keys, index, length, tag, style, type;
    if (map === null) return {};
    result = {};
    keys = Object.keys(map);
    for(index = 0, length = keys.length; index < length; index += 1){
        tag = keys[index];
        style = String(map[tag]);
        if (tag.slice(0, 2) === '!!') {
            tag = 'tag:yaml.org,2002:' + tag.slice(2);
        }
        type = schema.compiledTypeMap['fallback'][tag];
        if (type && _hasOwnProperty.call(type.styleAliases, style)) {
            style = type.styleAliases[style];
        }
        result[tag] = style;
    }
    return result;
}
function encodeHex(character) {
    var string, handle, length;
    string = character.toString(16).toUpperCase();
    if (character <= 0xFF) {
        handle = 'x';
        length = 2;
    } else if (character <= 0xFFFF) {
        handle = 'u';
        length = 4;
    } else if (character <= 0xFFFFFFFF) {
        handle = 'U';
        length = 8;
    } else {
        throw new YAMLException('code point within a string may not be greater than 0xFFFFFFFF');
    }
    return '\\' + handle + common.repeat('0', length - string.length) + string;
}
function State(options) {
    this.schema = options['schema'] || DEFAULT_FULL_SCHEMA;
    this.indent = Math.max(1, options['indent'] || 2);
    this.noArrayIndent = options['noArrayIndent'] || false;
    this.skipInvalid = options['skipInvalid'] || false;
    this.flowLevel = common.isNothing(options['flowLevel']) ? -1 : options['flowLevel'];
    this.styleMap = compileStyleMap(this.schema, options['styles'] || null);
    this.sortKeys = options['sortKeys'] || false;
    this.lineWidth = options['lineWidth'] || 80;
    this.noRefs = options['noRefs'] || false;
    this.noCompatMode = options['noCompatMode'] || false;
    this.condenseFlow = options['condenseFlow'] || false;
    this.implicitTypes = this.schema.compiledImplicit;
    this.explicitTypes = this.schema.compiledExplicit;
    this.tag = null;
    this.result = '';
    this.duplicates = [];
    this.usedDuplicates = null;
}
// Indents every line in a string. Empty lines (\n only) are not indented.
function indentString(string, spaces) {
    var ind = common.repeat(' ', spaces), position = 0, next = -1, result = '', line, length = string.length;
    while(position < length){
        next = string.indexOf('\n', position);
        if (next === -1) {
            line = string.slice(position);
            position = length;
        } else {
            line = string.slice(position, next + 1);
            position = next + 1;
        }
        if (line.length && line !== '\n') result += ind;
        result += line;
    }
    return result;
}
function generateNextLine(state, level) {
    return '\n' + common.repeat(' ', state.indent * level);
}
function testImplicitResolving(state, str) {
    var index, length, type;
    for(index = 0, length = state.implicitTypes.length; index < length; index += 1){
        type = state.implicitTypes[index];
        if (type.resolve(str)) {
            return true;
        }
    }
    return false;
}
// [33] s-white ::= s-space | s-tab
function isWhitespace(c) {
    return c === CHAR_SPACE || c === CHAR_TAB;
}
// Returns true if the character can be printed without escaping.
// From YAML 1.2: "any allowed characters known to be non-printable
// should also be escaped. [However,] This isn’t mandatory"
// Derived from nb-char - \t - #x85 - #xA0 - #x2028 - #x2029.
function isPrintable(c) {
    return 0x00020 <= c && c <= 0x00007E || 0x000A1 <= c && c <= 0x00D7FF && c !== 0x2028 && c !== 0x2029 || 0x0E000 <= c && c <= 0x00FFFD && c !== 0xFEFF /* BOM */  || 0x10000 <= c && c <= 0x10FFFF;
}
// [34] ns-char ::= nb-char - s-white
// [27] nb-char ::= c-printable - b-char - c-byte-order-mark
// [26] b-char  ::= b-line-feed | b-carriage-return
// [24] b-line-feed       ::=     #xA    /* LF */
// [25] b-carriage-return ::=     #xD    /* CR */
// [3]  c-byte-order-mark ::=     #xFEFF
function isNsChar(c) {
    return isPrintable(c) && !isWhitespace(c) && c !== 0xFEFF && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
}
// Simplified test for values allowed after the first character in plain style.
function isPlainSafe(c, prev) {
    // Uses a subset of nb-char - c-flow-indicator - ":" - "#"
    // where nb-char ::= c-printable - b-char - c-byte-order-mark.
    return isPrintable(c) && c !== 0xFEFF && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_COLON && (c !== CHAR_SHARP || prev && isNsChar(prev));
}
// Simplified test for values allowed as the first character in plain style.
function isPlainSafeFirst(c) {
    // Uses a subset of ns-char - c-indicator
    // where ns-char = nb-char - s-white.
    return isPrintable(c) && c !== 0xFEFF && !isWhitespace(c) // - s-white
     && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
}
// Determines whether block indentation indicator is required.
function needIndentIndicator(string) {
    var leadingSpaceRe = /^\n* /;
    return leadingSpaceRe.test(string);
}
var STYLE_PLAIN = 1, STYLE_SINGLE = 2, STYLE_LITERAL = 3, STYLE_FOLDED = 4, STYLE_DOUBLE = 5;
// Determines which scalar styles are possible and returns the preferred style.
// lineWidth = -1 => no limit.
// Pre-conditions: str.length > 0.
// Post-conditions:
//    STYLE_PLAIN or STYLE_SINGLE => no \n are in the string.
//    STYLE_LITERAL => no lines are suitable for folding (or lineWidth is -1).
//    STYLE_FOLDED => a line > lineWidth and can be folded (and lineWidth != -1).
function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType) {
    var i;
    var char, prev_char;
    var hasLineBreak = false;
    var hasFoldableLine = false; // only checked if shouldTrackWidth
    var shouldTrackWidth = lineWidth !== -1;
    var previousLineBreak = -1; // count the first line correctly
    var plain = isPlainSafeFirst(string.charCodeAt(0)) && !isWhitespace(string.charCodeAt(string.length - 1));
    if (singleLineOnly) {
        // Case: no block styles.
        // Check for disallowed characters to rule out plain and single.
        for(i = 0; i < string.length; i++){
            char = string.charCodeAt(i);
            if (!isPrintable(char)) {
                return STYLE_DOUBLE;
            }
            prev_char = i > 0 ? string.charCodeAt(i - 1) : null;
            plain = plain && isPlainSafe(char, prev_char);
        }
    } else {
        // Case: block styles permitted.
        for(i = 0; i < string.length; i++){
            char = string.charCodeAt(i);
            if (char === CHAR_LINE_FEED) {
                hasLineBreak = true;
                // Check if any line can be folded.
                if (shouldTrackWidth) {
                    hasFoldableLine = hasFoldableLine || i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== ' ';
                    previousLineBreak = i;
                }
            } else if (!isPrintable(char)) {
                return STYLE_DOUBLE;
            }
            prev_char = i > 0 ? string.charCodeAt(i - 1) : null;
            plain = plain && isPlainSafe(char, prev_char);
        }
        // in case the end is missing a \n
        hasFoldableLine = hasFoldableLine || shouldTrackWidth && i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== ' ';
    }
    // Although every style can represent \n without escaping, prefer block styles
    // for multiline, since they're more readable and they don't add empty lines.
    // Also prefer folding a super-long line.
    if (!hasLineBreak && !hasFoldableLine) {
        // Strings interpretable as another type have to be quoted;
        // e.g. the string 'true' vs. the boolean true.
        return plain && !testAmbiguousType(string) ? STYLE_PLAIN : STYLE_SINGLE;
    }
    // Edge case: block indentation indicator can only have one digit.
    if (indentPerLevel > 9 && needIndentIndicator(string)) {
        return STYLE_DOUBLE;
    }
    // At this point we know block styles are valid.
    // Prefer literal style unless we want to fold.
    return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
}
// Note: line breaking/folding is implemented for only the folded style.
// NB. We drop the last trailing newline (if any) of a returned block scalar
//  since the dumper adds its own newline. This always works:
//    • No ending newline => unaffected; already using strip "-" chomping.
//    • Ending newline    => removed then restored.
//  Importantly, this keeps the "+" chomp indicator from gaining an extra line.
function writeScalar(state, string, level, iskey) {
    state.dump = function() {
        if (string.length === 0) {
            return "''";
        }
        if (!state.noCompatMode && DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1) {
            return "'" + string + "'";
        }
        var indent = state.indent * Math.max(1, level); // no 0-indent scalars
        // As indentation gets deeper, let the width decrease monotonically
        // to the lower bound min(state.lineWidth, 40).
        // Note that this implies
        //  state.lineWidth ≤ 40 + state.indent: width is fixed at the lower bound.
        //  state.lineWidth > 40 + state.indent: width decreases until the lower bound.
        // This behaves better than a constant minimum width which disallows narrower options,
        // or an indent threshold which causes the width to suddenly increase.
        var lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
        // Without knowing if keys are implicit/explicit, assume implicit for safety.
        var singleLineOnly = iskey || state.flowLevel > -1 && level >= state.flowLevel;
        function testAmbiguity(string) {
            return testImplicitResolving(state, string);
        }
        switch(chooseScalarStyle(string, singleLineOnly, state.indent, lineWidth, testAmbiguity)){
            case STYLE_PLAIN:
                return string;
            case STYLE_SINGLE:
                return "'" + string.replace(/'/g, "''") + "'";
            case STYLE_LITERAL:
                return '|' + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
            case STYLE_FOLDED:
                return '>' + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
            case STYLE_DOUBLE:
                return '"' + escapeString(string, lineWidth) + '"';
            default:
                throw new YAMLException('impossible error: invalid scalar style');
        }
    }();
}
// Pre-conditions: string is valid for a block scalar, 1 <= indentPerLevel <= 9.
function blockHeader(string, indentPerLevel) {
    var indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : '';
    // note the special case: the string '\n' counts as a "trailing" empty line.
    var clip = string[string.length - 1] === '\n';
    var keep = clip && (string[string.length - 2] === '\n' || string === '\n');
    var chomp = keep ? '+' : clip ? '' : '-';
    return indentIndicator + chomp + '\n';
}
// (See the note for writeScalar.)
function dropEndingNewline(string) {
    return string[string.length - 1] === '\n' ? string.slice(0, -1) : string;
}
// Note: a long line without a suitable break point will exceed the width limit.
// Pre-conditions: every char in str isPrintable, str.length > 0, width > 0.
function foldString(string, width) {
    // In folded style, $k$ consecutive newlines output as $k+1$ newlines—
    // unless they're before or after a more-indented line, or at the very
    // beginning or end, in which case $k$ maps to $k$.
    // Therefore, parse each chunk as newline(s) followed by a content line.
    var lineRe = /(\n+)([^\n]*)/g;
    // first line (possibly an empty line)
    var result = function() {
        var nextLF = string.indexOf('\n');
        nextLF = nextLF !== -1 ? nextLF : string.length;
        lineRe.lastIndex = nextLF;
        return foldLine(string.slice(0, nextLF), width);
    }();
    // If we haven't reached the first content line yet, don't add an extra \n.
    var prevMoreIndented = string[0] === '\n' || string[0] === ' ';
    var moreIndented;
    // rest of the lines
    var match;
    while(match = lineRe.exec(string)){
        var prefix = match[1], line = match[2];
        moreIndented = line[0] === ' ';
        result += prefix + (!prevMoreIndented && !moreIndented && line !== '' ? '\n' : '') + foldLine(line, width);
        prevMoreIndented = moreIndented;
    }
    return result;
}
// Greedy line breaking.
// Picks the longest line under the limit each time,
// otherwise settles for the shortest line over the limit.
// NB. More-indented lines *cannot* be folded, as that would add an extra \n.
function foldLine(line, width) {
    if (line === '' || line[0] === ' ') return line;
    // Since a more-indented line adds a \n, breaks can't be followed by a space.
    var breakRe = / [^ ]/g; // note: the match index will always be <= length-2.
    var match;
    // start is an inclusive index. end, curr, and next are exclusive.
    var start = 0, end, curr = 0, next = 0;
    var result = '';
    // Invariants: 0 <= start <= length-1.
    //   0 <= curr <= next <= max(0, length-2). curr - start <= width.
    // Inside the loop:
    //   A match implies length >= 2, so curr and next are <= length-2.
    while(match = breakRe.exec(line)){
        next = match.index;
        // maintain invariant: curr - start <= width
        if (next - start > width) {
            end = curr > start ? curr : next; // derive end <= length-2
            result += '\n' + line.slice(start, end);
            // skip the space that was output as \n
            start = end + 1; // derive start <= length-1
        }
        curr = next;
    }
    // By the invariants, start <= length-1, so there is something left over.
    // It is either the whole string or a part starting from non-whitespace.
    result += '\n';
    // Insert a break if the remainder is too long and there is a break available.
    if (line.length - start > width && curr > start) {
        result += line.slice(start, curr) + '\n' + line.slice(curr + 1);
    } else {
        result += line.slice(start);
    }
    return result.slice(1); // drop extra \n joiner
}
// Escapes a double-quoted string.
function escapeString(string) {
    var result = '';
    var char, nextChar;
    var escapeSeq;
    for(var i = 0; i < string.length; i++){
        char = string.charCodeAt(i);
        // Check for surrogate pairs (reference Unicode 3.0 section "3.7 Surrogates").
        if (char >= 0xD800 && char <= 0xDBFF /* high surrogate */ ) {
            nextChar = string.charCodeAt(i + 1);
            if (nextChar >= 0xDC00 && nextChar <= 0xDFFF /* low surrogate */ ) {
                // Combine the surrogate pair and store it escaped.
                result += encodeHex((char - 0xD800) * 0x400 + nextChar - 0xDC00 + 0x10000);
                // Advance index one extra since we already used that char here.
                i++;
                continue;
            }
        }
        escapeSeq = ESCAPE_SEQUENCES[char];
        result += !escapeSeq && isPrintable(char) ? string[i] : escapeSeq || encodeHex(char);
    }
    return result;
}
function writeFlowSequence(state, level, object) {
    var _result = '', _tag = state.tag, index, length;
    for(index = 0, length = object.length; index < length; index += 1){
        // Write only valid elements.
        if (writeNode(state, level, object[index], false, false)) {
            if (index !== 0) _result += ',' + (!state.condenseFlow ? ' ' : '');
            _result += state.dump;
        }
    }
    state.tag = _tag;
    state.dump = '[' + _result + ']';
}
function writeBlockSequence(state, level, object, compact) {
    var _result = '', _tag = state.tag, index, length;
    for(index = 0, length = object.length; index < length; index += 1){
        // Write only valid elements.
        if (writeNode(state, level + 1, object[index], true, true)) {
            if (!compact || index !== 0) {
                _result += generateNextLine(state, level);
            }
            if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
                _result += '-';
            } else {
                _result += '- ';
            }
            _result += state.dump;
        }
    }
    state.tag = _tag;
    state.dump = _result || '[]'; // Empty sequence if no valid values.
}
function writeFlowMapping(state, level, object) {
    var _result = '', _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, pairBuffer;
    for(index = 0, length = objectKeyList.length; index < length; index += 1){
        pairBuffer = '';
        if (index !== 0) pairBuffer += ', ';
        if (state.condenseFlow) pairBuffer += '"';
        objectKey = objectKeyList[index];
        objectValue = object[objectKey];
        if (!writeNode(state, level, objectKey, false, false)) {
            continue; // Skip this pair because of invalid key;
        }
        if (state.dump.length > 1024) pairBuffer += '? ';
        pairBuffer += state.dump + (state.condenseFlow ? '"' : '') + ':' + (state.condenseFlow ? '' : ' ');
        if (!writeNode(state, level, objectValue, false, false)) {
            continue; // Skip this pair because of invalid value.
        }
        pairBuffer += state.dump;
        // Both key and value are valid.
        _result += pairBuffer;
    }
    state.tag = _tag;
    state.dump = '{' + _result + '}';
}
function writeBlockMapping(state, level, object, compact) {
    var _result = '', _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, explicitPair, pairBuffer;
    // Allow sorting keys so that the output file is deterministic
    if (state.sortKeys === true) {
        // Default sorting
        objectKeyList.sort();
    } else if (typeof state.sortKeys === 'function') {
        // Custom sort function
        objectKeyList.sort(state.sortKeys);
    } else if (state.sortKeys) {
        // Something is wrong
        throw new YAMLException('sortKeys must be a boolean or a function');
    }
    for(index = 0, length = objectKeyList.length; index < length; index += 1){
        pairBuffer = '';
        if (!compact || index !== 0) {
            pairBuffer += generateNextLine(state, level);
        }
        objectKey = objectKeyList[index];
        objectValue = object[objectKey];
        if (!writeNode(state, level + 1, objectKey, true, true, true)) {
            continue; // Skip this pair because of invalid key.
        }
        explicitPair = state.tag !== null && state.tag !== '?' || state.dump && state.dump.length > 1024;
        if (explicitPair) {
            if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
                pairBuffer += '?';
            } else {
                pairBuffer += '? ';
            }
        }
        pairBuffer += state.dump;
        if (explicitPair) {
            pairBuffer += generateNextLine(state, level);
        }
        if (!writeNode(state, level + 1, objectValue, true, explicitPair)) {
            continue; // Skip this pair because of invalid value.
        }
        if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
            pairBuffer += ':';
        } else {
            pairBuffer += ': ';
        }
        pairBuffer += state.dump;
        // Both key and value are valid.
        _result += pairBuffer;
    }
    state.tag = _tag;
    state.dump = _result || '{}'; // Empty mapping if no valid pairs.
}
function detectType(state, object, explicit) {
    var _result, typeList, index, length, type, style;
    typeList = explicit ? state.explicitTypes : state.implicitTypes;
    for(index = 0, length = typeList.length; index < length; index += 1){
        type = typeList[index];
        if ((type.instanceOf || type.predicate) && (!type.instanceOf || typeof object === 'object' && object instanceof type.instanceOf) && (!type.predicate || type.predicate(object))) {
            state.tag = explicit ? type.tag : '?';
            if (type.represent) {
                style = state.styleMap[type.tag] || type.defaultStyle;
                if (_toString.call(type.represent) === '[object Function]') {
                    _result = type.represent(object, style);
                } else if (_hasOwnProperty.call(type.represent, style)) {
                    _result = type.represent[style](object, style);
                } else {
                    throw new YAMLException('!<' + type.tag + '> tag resolver accepts not "' + style + '" style');
                }
                state.dump = _result;
            }
            return true;
        }
    }
    return false;
}
// Serializes `object` and writes it to global `result`.
// Returns true on success, or false on invalid object.
//
function writeNode(state, level, object, block, compact, iskey) {
    state.tag = null;
    state.dump = object;
    if (!detectType(state, object, false)) {
        detectType(state, object, true);
    }
    var type = _toString.call(state.dump);
    if (block) {
        block = state.flowLevel < 0 || state.flowLevel > level;
    }
    var objectOrArray = type === '[object Object]' || type === '[object Array]', duplicateIndex, duplicate;
    if (objectOrArray) {
        duplicateIndex = state.duplicates.indexOf(object);
        duplicate = duplicateIndex !== -1;
    }
    if (state.tag !== null && state.tag !== '?' || duplicate || state.indent !== 2 && level > 0) {
        compact = false;
    }
    if (duplicate && state.usedDuplicates[duplicateIndex]) {
        state.dump = '*ref_' + duplicateIndex;
    } else {
        if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) {
            state.usedDuplicates[duplicateIndex] = true;
        }
        if (type === '[object Object]') {
            if (block && Object.keys(state.dump).length !== 0) {
                writeBlockMapping(state, level, state.dump, compact);
                if (duplicate) {
                    state.dump = '&ref_' + duplicateIndex + state.dump;
                }
            } else {
                writeFlowMapping(state, level, state.dump);
                if (duplicate) {
                    state.dump = '&ref_' + duplicateIndex + ' ' + state.dump;
                }
            }
        } else if (type === '[object Array]') {
            var arrayLevel = state.noArrayIndent && level > 0 ? level - 1 : level;
            if (block && state.dump.length !== 0) {
                writeBlockSequence(state, arrayLevel, state.dump, compact);
                if (duplicate) {
                    state.dump = '&ref_' + duplicateIndex + state.dump;
                }
            } else {
                writeFlowSequence(state, arrayLevel, state.dump);
                if (duplicate) {
                    state.dump = '&ref_' + duplicateIndex + ' ' + state.dump;
                }
            }
        } else if (type === '[object String]') {
            if (state.tag !== '?') {
                writeScalar(state, state.dump, level, iskey);
            }
        } else {
            if (state.skipInvalid) return false;
            throw new YAMLException('unacceptable kind of an object to dump ' + type);
        }
        if (state.tag !== null && state.tag !== '?') {
            state.dump = '!<' + state.tag + '> ' + state.dump;
        }
    }
    return true;
}
function getDuplicateReferences(object, state) {
    var objects = [], duplicatesIndexes = [], index, length;
    inspectNode(object, objects, duplicatesIndexes);
    for(index = 0, length = duplicatesIndexes.length; index < length; index += 1){
        state.duplicates.push(objects[duplicatesIndexes[index]]);
    }
    state.usedDuplicates = new Array(length);
}
function inspectNode(object, objects, duplicatesIndexes) {
    var objectKeyList, index, length;
    if (object !== null && typeof object === 'object') {
        index = objects.indexOf(object);
        if (index !== -1) {
            if (duplicatesIndexes.indexOf(index) === -1) {
                duplicatesIndexes.push(index);
            }
        } else {
            objects.push(object);
            if (Array.isArray(object)) {
                for(index = 0, length = object.length; index < length; index += 1){
                    inspectNode(object[index], objects, duplicatesIndexes);
                }
            } else {
                objectKeyList = Object.keys(object);
                for(index = 0, length = objectKeyList.length; index < length; index += 1){
                    inspectNode(object[objectKeyList[index]], objects, duplicatesIndexes);
                }
            }
        }
    }
}
function dump(input, options) {
    options = options || {};
    var state = new State(options);
    if (!state.noRefs) getDuplicateReferences(input, state);
    if (writeNode(state, 0, input, true, true)) return state.dump + '\n';
    return '';
}
function safeDump(input, options) {
    return dump(input, common.extend({
        schema: DEFAULT_SAFE_SCHEMA
    }, options));
}
module.exports.dump = dump;
module.exports.safeDump = safeDump;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var loader = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/loader.js [instrumentation] (ecmascript)");
var dumper = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/dumper.js [instrumentation] (ecmascript)");
function deprecated(name) {
    return function() {
        throw new Error('Function ' + name + ' is deprecated and cannot be used.');
    };
}
module.exports.Type = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/type.js [instrumentation] (ecmascript)");
module.exports.Schema = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/schema.js [instrumentation] (ecmascript)");
module.exports.FAILSAFE_SCHEMA = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/schema/failsafe.js [instrumentation] (ecmascript)");
module.exports.JSON_SCHEMA = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/schema/json.js [instrumentation] (ecmascript)");
module.exports.CORE_SCHEMA = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/schema/core.js [instrumentation] (ecmascript)");
module.exports.DEFAULT_SAFE_SCHEMA = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/schema/default_safe.js [instrumentation] (ecmascript)");
module.exports.DEFAULT_FULL_SCHEMA = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/schema/default_full.js [instrumentation] (ecmascript)");
module.exports.load = loader.load;
module.exports.loadAll = loader.loadAll;
module.exports.safeLoad = loader.safeLoad;
module.exports.safeLoadAll = loader.safeLoadAll;
module.exports.dump = dumper.dump;
module.exports.safeDump = dumper.safeDump;
module.exports.YAMLException = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/exception.js [instrumentation] (ecmascript)");
// Deprecated schema names from JS-YAML 2.0.x
module.exports.MINIMAL_SCHEMA = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/schema/failsafe.js [instrumentation] (ecmascript)");
module.exports.SAFE_SCHEMA = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/schema/default_safe.js [instrumentation] (ecmascript)");
module.exports.DEFAULT_SCHEMA = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml/schema/default_full.js [instrumentation] (ecmascript)");
// Deprecated functions from JS-YAML 1.x.x
module.exports.scan = deprecated('scan');
module.exports.parse = deprecated('parse');
module.exports.compose = deprecated('compose');
module.exports.addConstructor = deprecated('addConstructor');
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/index.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var yaml = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/lib/js-yaml.js [instrumentation] (ecmascript)");
module.exports = yaml;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/gray-matter@4.0.3/node_modules/gray-matter/lib/engines.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

const yaml = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/js-yaml@3.14.2/node_modules/js-yaml/index.js [instrumentation] (ecmascript)");
/**
 * Default engines
 */ const engines = exports = module.exports;
/**
 * YAML
 */ engines.yaml = {
    parse: yaml.safeLoad.bind(yaml),
    stringify: yaml.safeDump.bind(yaml)
};
/**
 * JSON
 */ engines.json = {
    parse: JSON.parse.bind(JSON),
    stringify: function(obj, options) {
        const opts = Object.assign({
            replacer: null,
            space: 2
        }, options);
        return JSON.stringify(obj, opts.replacer, opts.space);
    }
};
/**
 * JavaScript
 */ engines.javascript = {
    parse: function parse(str, options, wrap) {
        /* eslint no-eval: 0 */ try {
            if (wrap !== false) {
                str = '(function() {\nreturn ' + str.trim() + ';\n}());';
            }
            return eval(str) || {};
        } catch (err) {
            if (wrap !== false && /(unexpected|identifier)/i.test(err.message)) {
                return parse(str, options, false);
            }
            throw new SyntaxError(err);
        }
    },
    stringify: function() {
        throw new Error('stringifying JavaScript is not supported');
    }
};
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/gray-matter@4.0.3/node_modules/gray-matter/lib/utils.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

const stripBom = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/strip-bom-string@1.0.0/node_modules/strip-bom-string/index.js [instrumentation] (ecmascript)");
const typeOf = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/kind-of@6.0.3/node_modules/kind-of/index.js [instrumentation] (ecmascript)");
exports.define = function(obj, key, val) {
    Reflect.defineProperty(obj, key, {
        enumerable: false,
        configurable: true,
        writable: true,
        value: val
    });
};
/**
 * Returns true if `val` is a buffer
 */ exports.isBuffer = function(val) {
    return typeOf(val) === 'buffer';
};
/**
 * Returns true if `val` is an object
 */ exports.isObject = function(val) {
    return typeOf(val) === 'object';
};
/**
 * Cast `input` to a buffer
 */ exports.toBuffer = function(input) {
    return typeof input === 'string' ? Buffer.from(input) : input;
};
/**
 * Cast `val` to a string.
 */ exports.toString = function(input) {
    if (exports.isBuffer(input)) return stripBom(String(input));
    if (typeof input !== 'string') {
        throw new TypeError('expected input to be a string or buffer');
    }
    return stripBom(input);
};
/**
 * Cast `val` to an array.
 */ exports.arrayify = function(val) {
    return val ? Array.isArray(val) ? val : [
        val
    ] : [];
};
/**
 * Returns true if `str` starts with `substr`.
 */ exports.startsWith = function(str, substr, len) {
    if (typeof len !== 'number') len = substr.length;
    return str.slice(0, len) === substr;
};
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/gray-matter@4.0.3/node_modules/gray-matter/lib/defaults.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

const engines = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/gray-matter@4.0.3/node_modules/gray-matter/lib/engines.js [instrumentation] (ecmascript)");
const utils = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/gray-matter@4.0.3/node_modules/gray-matter/lib/utils.js [instrumentation] (ecmascript)");
module.exports = function(options) {
    const opts = Object.assign({}, options);
    // ensure that delimiters are an array
    opts.delimiters = utils.arrayify(opts.delims || opts.delimiters || '---');
    if (opts.delimiters.length === 1) {
        opts.delimiters.push(opts.delimiters[0]);
    }
    opts.language = (opts.language || opts.lang || 'yaml').toLowerCase();
    opts.engines = Object.assign({}, engines, opts.parsers, opts.engines);
    return opts;
};
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/gray-matter@4.0.3/node_modules/gray-matter/lib/engine.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

module.exports = function(name, options) {
    let engine = options.engines[name] || options.engines[aliase(name)];
    if (typeof engine === 'undefined') {
        throw new Error('gray-matter engine "' + name + '" is not registered');
    }
    if (typeof engine === 'function') {
        engine = {
            parse: engine
        };
    }
    return engine;
};
function aliase(name) {
    switch(name.toLowerCase()){
        case 'js':
        case 'javascript':
            return 'javascript';
        case 'coffee':
        case 'coffeescript':
        case 'cson':
            return 'coffee';
        case 'yaml':
        case 'yml':
            return 'yaml';
        default:
            {
                return name;
            }
    }
}
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/gray-matter@4.0.3/node_modules/gray-matter/lib/stringify.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

const typeOf = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/kind-of@6.0.3/node_modules/kind-of/index.js [instrumentation] (ecmascript)");
const getEngine = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/gray-matter@4.0.3/node_modules/gray-matter/lib/engine.js [instrumentation] (ecmascript)");
const defaults = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/gray-matter@4.0.3/node_modules/gray-matter/lib/defaults.js [instrumentation] (ecmascript)");
module.exports = function(file, data, options) {
    if (data == null && options == null) {
        switch(typeOf(file)){
            case 'object':
                data = file.data;
                options = {};
                break;
            case 'string':
                return file;
            default:
                {
                    throw new TypeError('expected file to be a string or object');
                }
        }
    }
    const str = file.content;
    const opts = defaults(options);
    if (data == null) {
        if (!opts.data) return file;
        data = opts.data;
    }
    const language = file.language || opts.language;
    const engine = getEngine(language, opts);
    if (typeof engine.stringify !== 'function') {
        throw new TypeError('expected "' + language + '.stringify" to be a function');
    }
    data = Object.assign({}, file.data, data);
    const open = opts.delimiters[0];
    const close = opts.delimiters[1];
    const matter = engine.stringify(data, options).trim();
    let buf = '';
    if (matter !== '{}') {
        buf = newline(open) + newline(matter) + newline(close);
    }
    if (typeof file.excerpt === 'string' && file.excerpt !== '') {
        if (str.indexOf(file.excerpt.trim()) === -1) {
            buf += newline(file.excerpt) + newline(close);
        }
    }
    return buf + newline(str);
};
function newline(str) {
    return str.slice(-1) !== '\n' ? str + '\n' : str;
}
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/gray-matter@4.0.3/node_modules/gray-matter/lib/excerpt.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

const defaults = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/gray-matter@4.0.3/node_modules/gray-matter/lib/defaults.js [instrumentation] (ecmascript)");
module.exports = function(file, options) {
    const opts = defaults(options);
    if (file.data == null) {
        file.data = {};
    }
    if (typeof opts.excerpt === 'function') {
        return opts.excerpt(file, opts);
    }
    const sep = file.data.excerpt_separator || opts.excerpt_separator;
    if (sep == null && (opts.excerpt === false || opts.excerpt == null)) {
        return file;
    }
    const delimiter = typeof opts.excerpt === 'string' ? opts.excerpt : sep || opts.delimiters[0];
    // if enabled, get the excerpt defined after front-matter
    const idx = file.content.indexOf(delimiter);
    if (idx !== -1) {
        file.excerpt = file.content.slice(0, idx);
    }
    return file;
};
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/gray-matter@4.0.3/node_modules/gray-matter/lib/to-file.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

const typeOf = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/kind-of@6.0.3/node_modules/kind-of/index.js [instrumentation] (ecmascript)");
const stringify = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/gray-matter@4.0.3/node_modules/gray-matter/lib/stringify.js [instrumentation] (ecmascript)");
const utils = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/gray-matter@4.0.3/node_modules/gray-matter/lib/utils.js [instrumentation] (ecmascript)");
/**
 * Normalize the given value to ensure an object is returned
 * with the expected properties.
 */ module.exports = function(file) {
    if (typeOf(file) !== 'object') {
        file = {
            content: file
        };
    }
    if (typeOf(file.data) !== 'object') {
        file.data = {};
    }
    // if file was passed as an object, ensure that
    // "file.content" is set
    if (file.contents && file.content == null) {
        file.content = file.contents;
    }
    // set non-enumerable properties on the file object
    utils.define(file, 'orig', utils.toBuffer(file.content));
    utils.define(file, 'language', file.language || '');
    utils.define(file, 'matter', file.matter || '');
    utils.define(file, 'stringify', function(data, options) {
        if (options && options.language) {
            file.language = options.language;
        }
        return stringify(file, data, options);
    });
    // strip BOM and ensure that "file.content" is a string
    file.content = utils.toString(file.content);
    file.isEmpty = false;
    file.excerpt = '';
    return file;
};
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/gray-matter@4.0.3/node_modules/gray-matter/lib/parse.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

const getEngine = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/gray-matter@4.0.3/node_modules/gray-matter/lib/engine.js [instrumentation] (ecmascript)");
const defaults = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/gray-matter@4.0.3/node_modules/gray-matter/lib/defaults.js [instrumentation] (ecmascript)");
module.exports = function(language, str, options) {
    const opts = defaults(options);
    const engine = getEngine(language, opts);
    if (typeof engine.parse !== 'function') {
        throw new TypeError('expected "' + language + '.parse" to be a function');
    }
    return engine.parse(str, opts);
};
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/gray-matter@4.0.3/node_modules/gray-matter/index.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

const fs = __turbopack_context__.r("[externals]/fs [external] (fs, cjs)");
const sections = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/section-matter@1.0.0/node_modules/section-matter/index.js [instrumentation] (ecmascript)");
const defaults = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/gray-matter@4.0.3/node_modules/gray-matter/lib/defaults.js [instrumentation] (ecmascript)");
const stringify = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/gray-matter@4.0.3/node_modules/gray-matter/lib/stringify.js [instrumentation] (ecmascript)");
const excerpt = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/gray-matter@4.0.3/node_modules/gray-matter/lib/excerpt.js [instrumentation] (ecmascript)");
const engines = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/gray-matter@4.0.3/node_modules/gray-matter/lib/engines.js [instrumentation] (ecmascript)");
const toFile = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/gray-matter@4.0.3/node_modules/gray-matter/lib/to-file.js [instrumentation] (ecmascript)");
const parse = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/gray-matter@4.0.3/node_modules/gray-matter/lib/parse.js [instrumentation] (ecmascript)");
const utils = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/gray-matter@4.0.3/node_modules/gray-matter/lib/utils.js [instrumentation] (ecmascript)");
/**
 * Takes a string or object with `content` property, extracts
 * and parses front-matter from the string, then returns an object
 * with `data`, `content` and other [useful properties](#returned-object).
 *
 * ```js
 * const matter = require('gray-matter');
 * console.log(matter('---\ntitle: Home\n---\nOther stuff'));
 * //=> { data: { title: 'Home'}, content: 'Other stuff' }
 * ```
 * @param {Object|String} `input` String, or object with `content` string
 * @param {Object} `options`
 * @return {Object}
 * @api public
 */ function matter(input, options) {
    if (input === '') {
        return {
            data: {},
            content: input,
            excerpt: '',
            orig: input
        };
    }
    let file = toFile(input);
    const cached = matter.cache[file.content];
    if (!options) {
        if (cached) {
            file = Object.assign({}, cached);
            file.orig = cached.orig;
            return file;
        }
        // only cache if there are no options passed. if we cache when options
        // are passed, we would need to also cache options values, which would
        // negate any performance benefits of caching
        matter.cache[file.content] = file;
    }
    return parseMatter(file, options);
}
/**
 * Parse front matter
 */ function parseMatter(file, options) {
    const opts = defaults(options);
    const open = opts.delimiters[0];
    const close = '\n' + opts.delimiters[1];
    let str = file.content;
    if (opts.language) {
        file.language = opts.language;
    }
    // get the length of the opening delimiter
    const openLen = open.length;
    if (!utils.startsWith(str, open, openLen)) {
        excerpt(file, opts);
        return file;
    }
    // if the next character after the opening delimiter is
    // a character from the delimiter, then it's not a front-
    // matter delimiter
    if (str.charAt(openLen) === open.slice(-1)) {
        return file;
    }
    // strip the opening delimiter
    str = str.slice(openLen);
    const len = str.length;
    // use the language defined after first delimiter, if it exists
    const language = matter.language(str, opts);
    if (language.name) {
        file.language = language.name;
        str = str.slice(language.raw.length);
    }
    // get the index of the closing delimiter
    let closeIndex = str.indexOf(close);
    if (closeIndex === -1) {
        closeIndex = len;
    }
    // get the raw front-matter block
    file.matter = str.slice(0, closeIndex);
    const block = file.matter.replace(/^\s*#[^\n]+/gm, '').trim();
    if (block === '') {
        file.isEmpty = true;
        file.empty = file.content;
        file.data = {};
    } else {
        // create file.data by parsing the raw file.matter block
        file.data = parse(file.language, file.matter, opts);
    }
    // update file.content
    if (closeIndex === len) {
        file.content = '';
    } else {
        file.content = str.slice(closeIndex + close.length);
        if (file.content[0] === '\r') {
            file.content = file.content.slice(1);
        }
        if (file.content[0] === '\n') {
            file.content = file.content.slice(1);
        }
    }
    excerpt(file, opts);
    if (opts.sections === true || typeof opts.section === 'function') {
        sections(file, opts.section);
    }
    return file;
}
/**
 * Expose engines
 */ matter.engines = engines;
/**
 * Stringify an object to YAML or the specified language, and
 * append it to the given string. By default, only YAML and JSON
 * can be stringified. See the [engines](#engines) section to learn
 * how to stringify other languages.
 *
 * ```js
 * console.log(matter.stringify('foo bar baz', {title: 'Home'}));
 * // results in:
 * // ---
 * // title: Home
 * // ---
 * // foo bar baz
 * ```
 * @param {String|Object} `file` The content string to append to stringified front-matter, or a file object with `file.content` string.
 * @param {Object} `data` Front matter to stringify.
 * @param {Object} `options` [Options](#options) to pass to gray-matter and [js-yaml].
 * @return {String} Returns a string created by wrapping stringified yaml with delimiters, and appending that to the given string.
 * @api public
 */ matter.stringify = function(file, data, options) {
    if (typeof file === 'string') file = matter(file, options);
    return stringify(file, data, options);
};
/**
 * Synchronously read a file from the file system and parse
 * front matter. Returns the same object as the [main function](#matter).
 *
 * ```js
 * const file = matter.read('./content/blog-post.md');
 * ```
 * @param {String} `filepath` file path of the file to read.
 * @param {Object} `options` [Options](#options) to pass to gray-matter.
 * @return {Object} Returns [an object](#returned-object) with `data` and `content`
 * @api public
 */ matter.read = function(filepath, options) {
    const str = fs.readFileSync(filepath, 'utf8');
    const file = matter(str, options);
    file.path = filepath;
    return file;
};
/**
 * Returns true if the given `string` has front matter.
 * @param  {String} `string`
 * @param  {Object} `options`
 * @return {Boolean} True if front matter exists.
 * @api public
 */ matter.test = function(str, options) {
    return utils.startsWith(str, defaults(options).delimiters[0]);
};
/**
 * Detect the language to use, if one is defined after the
 * first front-matter delimiter.
 * @param  {String} `string`
 * @param  {Object} `options`
 * @return {Object} Object with `raw` (actual language string), and `name`, the language with whitespace trimmed
 */ matter.language = function(str, options) {
    const opts = defaults(options);
    const open = opts.delimiters[0];
    if (matter.test(str)) {
        str = str.slice(open.length);
    }
    const language = str.slice(0, str.search(/\r?\n/));
    return {
        raw: language,
        name: language ? language.trim() : ''
    };
};
/**
 * Expose `matter`
 */ matter.cache = {};
matter.clearCache = function() {
    matter.cache = {};
};
module.exports = matter;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/strip-bom-string@1.0.0/node_modules/strip-bom-string/index.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

/*!
 * strip-bom-string <https://github.com/jonschlinkert/strip-bom-string>
 *
 * Copyright (c) 2015, 2017, Jon Schlinkert.
 * Released under the MIT License.
 */ module.exports = function(str) {
    if (typeof str === 'string' && str.charAt(0) === '\ufeff') {
        return str.slice(1);
    }
    return str;
};
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/tokenx@1.3.0/node_modules/tokenx/dist/index.mjs [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

//#region src/index.ts
__turbopack_context__.s([
    "approximateTokenSize",
    ()=>approximateTokenSize,
    "estimateTokenCount",
    ()=>estimateTokenCount,
    "isWithinTokenLimit",
    ()=>isWithinTokenLimit,
    "sliceByTokens",
    ()=>sliceByTokens,
    "splitByTokens",
    ()=>splitByTokens
]);
const PATTERNS = {
    whitespace: /^\s+$/,
    cjk: /[\u4E00-\u9FFF\u3400-\u4DBF\u3000-\u303F\uFF00-\uFFEF\u30A0-\u30FF\u2E80-\u2EFF\u31C0-\u31EF\u3200-\u32FF\u3300-\u33FF\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FF]/,
    numeric: /^\d+(?:[.,]\d+)*$/,
    punctuation: /[.,!?;(){}[\]<>:/\\|@#$%^&*+=`~_-]/,
    alphanumeric: /^[a-zA-Z0-9\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]+$/
};
const TOKEN_SPLIT_PATTERN = /* @__PURE__ */ new RegExp(`(\\s+|${PATTERNS.punctuation.source}+)`);
const DEFAULT_CHARS_PER_TOKEN = 6;
const SHORT_TOKEN_THRESHOLD = 3;
const DEFAULT_LANGUAGE_CONFIGS = [
    {
        pattern: /[äöüßẞ]/i,
        averageCharsPerToken: 3
    },
    {
        pattern: /[éèêëàâîïôûùüÿçœæáíóúñ]/i,
        averageCharsPerToken: 3
    },
    {
        pattern: /[ąćęłńóśźżěščřžýůúďťň]/i,
        averageCharsPerToken: 3.5
    }
];
/**
* Checks if a text string is within a specified token limit
*/ function isWithinTokenLimit(text, tokenLimit, options) {
    return estimateTokenCount(text, options) <= tokenLimit;
}
/** @deprecated Use `estimateTokenCount` instead */ const approximateTokenSize = estimateTokenCount;
/**
* Estimates the number of tokens in a text string using heuristic rules.
*/ function estimateTokenCount(text, options = {}) {
    if (!text) return 0;
    const { defaultCharsPerToken = DEFAULT_CHARS_PER_TOKEN, languageConfigs = DEFAULT_LANGUAGE_CONFIGS } = options;
    const segments = text.split(TOKEN_SPLIT_PATTERN).filter(Boolean);
    let tokenCount = 0;
    for (const segment of segments)tokenCount += estimateSegmentTokens(segment, languageConfigs, defaultCharsPerToken);
    return tokenCount;
}
/**
* Extracts a portion of text based on token positions, similar to Array.prototype.slice().
*/ function sliceByTokens(text, start = 0, end, options = {}) {
    if (!text) return "";
    const { defaultCharsPerToken = DEFAULT_CHARS_PER_TOKEN, languageConfigs = DEFAULT_LANGUAGE_CONFIGS } = options;
    let totalTokens = 0;
    if (start < 0 || end !== void 0 && end < 0) totalTokens = estimateTokenCount(text, options);
    const normalizedStart = start < 0 ? Math.max(0, totalTokens + start) : Math.max(0, start);
    const normalizedEnd = end === void 0 ? Infinity : end < 0 ? Math.max(0, totalTokens + end) : end;
    if (normalizedStart >= normalizedEnd) return "";
    const segments = text.split(TOKEN_SPLIT_PATTERN).filter(Boolean);
    const parts = [];
    let currentTokenPos = 0;
    for (const segment of segments){
        if (currentTokenPos >= normalizedEnd) break;
        const tokenCount = estimateSegmentTokens(segment, languageConfigs, defaultCharsPerToken);
        const extracted = extractSegmentPart(segment, currentTokenPos, tokenCount, normalizedStart, normalizedEnd);
        if (extracted) parts.push(extracted);
        currentTokenPos += tokenCount;
    }
    return parts.join("");
}
/**
* Splits text into chunks based on token count.
*/ function splitByTokens(text, tokensPerChunk, options = {}) {
    if (!text || tokensPerChunk <= 0) return [];
    const { defaultCharsPerToken = DEFAULT_CHARS_PER_TOKEN, languageConfigs = DEFAULT_LANGUAGE_CONFIGS, overlap = 0 } = options;
    const segments = text.split(TOKEN_SPLIT_PATTERN).filter(Boolean);
    const chunks = [];
    let currentChunk = [];
    let currentTokenCount = 0;
    for (const segment of segments){
        const tokenCount = estimateSegmentTokens(segment, languageConfigs, defaultCharsPerToken);
        currentChunk.push(segment);
        currentTokenCount += tokenCount;
        if (currentTokenCount >= tokensPerChunk) {
            chunks.push(currentChunk.join(""));
            if (overlap > 0) {
                const overlapSegments = [];
                let overlapTokenCount = 0;
                for(let i = currentChunk.length - 1; i >= 0 && overlapTokenCount < overlap; i--){
                    const segmentValue = currentChunk[i];
                    const tokCount = estimateSegmentTokens(segmentValue, languageConfigs, defaultCharsPerToken);
                    overlapSegments.unshift(segmentValue);
                    overlapTokenCount += tokCount;
                }
                currentChunk = overlapSegments;
                currentTokenCount = overlapTokenCount;
            } else {
                currentChunk = [];
                currentTokenCount = 0;
            }
        }
    }
    if (currentChunk.length > 0) chunks.push(currentChunk.join(""));
    return chunks;
}
function estimateSegmentTokens(segment, languageConfigs, defaultCharsPerToken) {
    if (PATTERNS.whitespace.test(segment)) return 0;
    if (PATTERNS.cjk.test(segment)) return getCharacterCount(segment);
    if (PATTERNS.numeric.test(segment)) return 1;
    if (segment.length <= SHORT_TOKEN_THRESHOLD) return 1;
    if (PATTERNS.punctuation.test(segment)) return segment.length > 1 ? Math.ceil(segment.length / 2) : 1;
    if (PATTERNS.alphanumeric.test(segment)) {
        const charsPerToken$1 = getLanguageSpecificCharsPerToken(segment, languageConfigs) ?? defaultCharsPerToken;
        return Math.ceil(segment.length / charsPerToken$1);
    }
    const charsPerToken = getLanguageSpecificCharsPerToken(segment, languageConfigs) ?? defaultCharsPerToken;
    return Math.ceil(segment.length / charsPerToken);
}
function getLanguageSpecificCharsPerToken(segment, languageConfigs) {
    for (const config of languageConfigs)if (config.pattern.test(segment)) return config.averageCharsPerToken;
}
function getCharacterCount(text) {
    return Array.from(text).length;
}
function extractSegmentPart(segment, segmentTokenStart, segmentTokenCount, targetStart, targetEnd) {
    if (segmentTokenCount === 0) return segmentTokenStart >= targetStart && segmentTokenStart < targetEnd ? segment : "";
    const segmentTokenEnd = segmentTokenStart + segmentTokenCount;
    if (segmentTokenStart >= targetEnd || segmentTokenEnd <= targetStart) return "";
    const overlapStart = Math.max(0, targetStart - segmentTokenStart);
    const overlapEnd = Math.min(segmentTokenCount, targetEnd - segmentTokenStart);
    if (overlapStart === 0 && overlapEnd === segmentTokenCount) return segment;
    const charStart = Math.floor(overlapStart / segmentTokenCount * segment.length);
    const charEnd = Math.ceil(overlapEnd / segmentTokenCount * segment.length);
    return segment.slice(charStart, charEnd);
}
;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/ignore@7.0.5/node_modules/ignore/index.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {

// A simple implementation of make-array
function makeArray(subject) {
    return Array.isArray(subject) ? subject : [
        subject
    ];
}
const UNDEFINED = undefined;
const EMPTY = '';
const SPACE = ' ';
const ESCAPE = '\\';
const REGEX_TEST_BLANK_LINE = /^\s+$/;
const REGEX_INVALID_TRAILING_BACKSLASH = /(?:[^\\]|^)\\$/;
const REGEX_REPLACE_LEADING_EXCAPED_EXCLAMATION = /^\\!/;
const REGEX_REPLACE_LEADING_EXCAPED_HASH = /^\\#/;
const REGEX_SPLITALL_CRLF = /\r?\n/g;
// Invalid:
// - /foo,
// - ./foo,
// - ../foo,
// - .
// - ..
// Valid:
// - .foo
const REGEX_TEST_INVALID_PATH = /^\.{0,2}\/|^\.{1,2}$/;
const REGEX_TEST_TRAILING_SLASH = /\/$/;
const SLASH = '/';
// Do not use ternary expression here, since "istanbul ignore next" is buggy
let TMP_KEY_IGNORE = 'node-ignore';
/* istanbul ignore else */ if (typeof Symbol !== 'undefined') {
    TMP_KEY_IGNORE = Symbol.for('node-ignore');
}
const KEY_IGNORE = TMP_KEY_IGNORE;
const define = (object, key, value)=>{
    Object.defineProperty(object, key, {
        value
    });
    return value;
};
const REGEX_REGEXP_RANGE = /([0-z])-([0-z])/g;
const RETURN_FALSE = ()=>false;
// Sanitize the range of a regular expression
// The cases are complicated, see test cases for details
const sanitizeRange = (range)=>range.replace(REGEX_REGEXP_RANGE, (match, from, to)=>from.charCodeAt(0) <= to.charCodeAt(0) ? match : EMPTY);
// See fixtures #59
const cleanRangeBackSlash = (slashes)=>{
    const { length } = slashes;
    return slashes.slice(0, length - length % 2);
};
// > If the pattern ends with a slash,
// > it is removed for the purpose of the following description,
// > but it would only find a match with a directory.
// > In other words, foo/ will match a directory foo and paths underneath it,
// > but will not match a regular file or a symbolic link foo
// >  (this is consistent with the way how pathspec works in general in Git).
// '`foo/`' will not match regular file '`foo`' or symbolic link '`foo`'
// -> ignore-rules will not deal with it, because it costs extra `fs.stat` call
//      you could use option `mark: true` with `glob`
// '`foo/`' should not continue with the '`..`'
const REPLACERS = [
    [
        // Remove BOM
        // TODO:
        // Other similar zero-width characters?
        /^\uFEFF/,
        ()=>EMPTY
    ],
    // > Trailing spaces are ignored unless they are quoted with backslash ("\")
    [
        // (a\ ) -> (a )
        // (a  ) -> (a)
        // (a ) -> (a)
        // (a \ ) -> (a  )
        /((?:\\\\)*?)(\\?\s+)$/,
        (_, m1, m2)=>m1 + (m2.indexOf('\\') === 0 ? SPACE : EMPTY)
    ],
    // Replace (\ ) with ' '
    // (\ ) -> ' '
    // (\\ ) -> '\\ '
    // (\\\ ) -> '\\ '
    [
        /(\\+?)\s/g,
        (_, m1)=>{
            const { length } = m1;
            return m1.slice(0, length - length % 2) + SPACE;
        }
    ],
    // Escape metacharacters
    // which is written down by users but means special for regular expressions.
    // > There are 12 characters with special meanings:
    // > - the backslash \,
    // > - the caret ^,
    // > - the dollar sign $,
    // > - the period or dot .,
    // > - the vertical bar or pipe symbol |,
    // > - the question mark ?,
    // > - the asterisk or star *,
    // > - the plus sign +,
    // > - the opening parenthesis (,
    // > - the closing parenthesis ),
    // > - and the opening square bracket [,
    // > - the opening curly brace {,
    // > These special characters are often called "metacharacters".
    [
        /[\\$.|*+(){^]/g,
        (match)=>`\\${match}`
    ],
    [
        // > a question mark (?) matches a single character
        /(?!\\)\?/g,
        ()=>'[^/]'
    ],
    // leading slash
    [
        // > A leading slash matches the beginning of the pathname.
        // > For example, "/*.c" matches "cat-file.c" but not "mozilla-sha1/sha1.c".
        // A leading slash matches the beginning of the pathname
        /^\//,
        ()=>'^'
    ],
    // replace special metacharacter slash after the leading slash
    [
        /\//g,
        ()=>'\\/'
    ],
    [
        // > A leading "**" followed by a slash means match in all directories.
        // > For example, "**/foo" matches file or directory "foo" anywhere,
        // > the same as pattern "foo".
        // > "**/foo/bar" matches file or directory "bar" anywhere that is directly
        // >   under directory "foo".
        // Notice that the '*'s have been replaced as '\\*'
        /^\^*\\\*\\\*\\\//,
        // '**/foo' <-> 'foo'
        ()=>'^(?:.*\\/)?'
    ],
    // starting
    [
        // there will be no leading '/'
        //   (which has been replaced by section "leading slash")
        // If starts with '**', adding a '^' to the regular expression also works
        /^(?=[^^])/,
        function startingReplacer() {
            // If has a slash `/` at the beginning or middle
            return !/\/(?!$)/.test(this) ? '(?:^|\\/)' : '^';
        }
    ],
    // two globstars
    [
        // Use lookahead assertions so that we could match more than one `'/**'`
        /\\\/\\\*\\\*(?=\\\/|$)/g,
        // Zero, one or several directories
        // should not use '*', or it will be replaced by the next replacer
        // Check if it is not the last `'/**'`
        (_, index, str)=>index + 6 < str.length ? '(?:\\/[^\\/]+)*' : '\\/.+'
    ],
    // normal intermediate wildcards
    [
        // Never replace escaped '*'
        // ignore rule '\*' will match the path '*'
        // 'abc.*/' -> go
        // 'abc.*'  -> skip this rule,
        //    coz trailing single wildcard will be handed by [trailing wildcard]
        /(^|[^\\]+)(\\\*)+(?=.+)/g,
        // '*.js' matches '.js'
        // '*.js' doesn't match 'abc'
        (_, p1, p2)=>{
            // 1.
            // > An asterisk "*" matches anything except a slash.
            // 2.
            // > Other consecutive asterisks are considered regular asterisks
            // > and will match according to the previous rules.
            const unescaped = p2.replace(/\\\*/g, '[^\\/]*');
            return p1 + unescaped;
        }
    ],
    [
        // unescape, revert step 3 except for back slash
        // For example, if a user escape a '\\*',
        // after step 3, the result will be '\\\\\\*'
        /\\\\\\(?=[$.|*+(){^])/g,
        ()=>ESCAPE
    ],
    [
        // '\\\\' -> '\\'
        /\\\\/g,
        ()=>ESCAPE
    ],
    [
        // > The range notation, e.g. [a-zA-Z],
        // > can be used to match one of the characters in a range.
        // `\` is escaped by step 3
        /(\\)?\[([^\]/]*?)(\\*)($|\])/g,
        (match, leadEscape, range, endEscape, close)=>leadEscape === ESCAPE ? `\\[${range}${cleanRangeBackSlash(endEscape)}${close}` : close === ']' ? endEscape.length % 2 === 0 ? `[${sanitizeRange(range)}${endEscape}]` : '[]' : '[]'
    ],
    // ending
    [
        // 'js' will not match 'js.'
        // 'ab' will not match 'abc'
        /(?:[^*])$/,
        // WTF!
        // https://git-scm.com/docs/gitignore
        // changes in [2.22.1](https://git-scm.com/docs/gitignore/2.22.1)
        // which re-fixes #24, #38
        // > If there is a separator at the end of the pattern then the pattern
        // > will only match directories, otherwise the pattern can match both
        // > files and directories.
        // 'js*' will not match 'a.js'
        // 'js/' will not match 'a.js'
        // 'js' will match 'a.js' and 'a.js/'
        (match)=>/\/$/.test(match) ? `${match}$` : `${match}(?=$|\\/$)`
    ]
];
const REGEX_REPLACE_TRAILING_WILDCARD = /(^|\\\/)?\\\*$/;
const MODE_IGNORE = 'regex';
const MODE_CHECK_IGNORE = 'checkRegex';
const UNDERSCORE = '_';
const TRAILING_WILD_CARD_REPLACERS = {
    [MODE_IGNORE] (_, p1) {
        const prefix = p1 ? `${p1}[^/]+` : '[^/]*';
        return `${prefix}(?=$|\\/$)`;
    },
    [MODE_CHECK_IGNORE] (_, p1) {
        // When doing `git check-ignore`
        const prefix = p1 ? `${p1}[^/]*` : '[^/]*';
        return `${prefix}(?=$|\\/$)`;
    }
};
// @param {pattern}
const makeRegexPrefix = (pattern)=>REPLACERS.reduce((prev, [matcher, replacer])=>prev.replace(matcher, replacer.bind(pattern)), pattern);
const isString = (subject)=>typeof subject === 'string';
// > A blank line matches no files, so it can serve as a separator for readability.
const checkPattern = (pattern)=>pattern && isString(pattern) && !REGEX_TEST_BLANK_LINE.test(pattern) && !REGEX_INVALID_TRAILING_BACKSLASH.test(pattern) && pattern.indexOf('#') !== 0;
const splitPattern = (pattern)=>pattern.split(REGEX_SPLITALL_CRLF).filter(Boolean);
class IgnoreRule {
    constructor(pattern, mark, body, ignoreCase, negative, prefix){
        this.pattern = pattern;
        this.mark = mark;
        this.negative = negative;
        define(this, 'body', body);
        define(this, 'ignoreCase', ignoreCase);
        define(this, 'regexPrefix', prefix);
    }
    get regex() {
        const key = UNDERSCORE + MODE_IGNORE;
        if (this[key]) {
            return this[key];
        }
        return this._make(MODE_IGNORE, key);
    }
    get checkRegex() {
        const key = UNDERSCORE + MODE_CHECK_IGNORE;
        if (this[key]) {
            return this[key];
        }
        return this._make(MODE_CHECK_IGNORE, key);
    }
    _make(mode, key) {
        const str = this.regexPrefix.replace(REGEX_REPLACE_TRAILING_WILDCARD, // It does not need to bind pattern
        TRAILING_WILD_CARD_REPLACERS[mode]);
        const regex = this.ignoreCase ? new RegExp(str, 'i') : new RegExp(str);
        return define(this, key, regex);
    }
}
const createRule = ({ pattern, mark }, ignoreCase)=>{
    let negative = false;
    let body = pattern;
    // > An optional prefix "!" which negates the pattern;
    if (body.indexOf('!') === 0) {
        negative = true;
        body = body.substr(1);
    }
    body = body// > Put a backslash ("\") in front of the first "!" for patterns that
    // >   begin with a literal "!", for example, `"\!important!.txt"`.
    .replace(REGEX_REPLACE_LEADING_EXCAPED_EXCLAMATION, '!')// > Put a backslash ("\") in front of the first hash for patterns that
    // >   begin with a hash.
    .replace(REGEX_REPLACE_LEADING_EXCAPED_HASH, '#');
    const regexPrefix = makeRegexPrefix(body);
    return new IgnoreRule(pattern, mark, body, ignoreCase, negative, regexPrefix);
};
class RuleManager {
    constructor(ignoreCase){
        this._ignoreCase = ignoreCase;
        this._rules = [];
    }
    _add(pattern) {
        // #32
        if (pattern && pattern[KEY_IGNORE]) {
            this._rules = this._rules.concat(pattern._rules._rules);
            this._added = true;
            return;
        }
        if (isString(pattern)) {
            pattern = {
                pattern
            };
        }
        if (checkPattern(pattern.pattern)) {
            const rule = createRule(pattern, this._ignoreCase);
            this._added = true;
            this._rules.push(rule);
        }
    }
    // @param {Array<string> | string | Ignore} pattern
    add(pattern) {
        this._added = false;
        makeArray(isString(pattern) ? splitPattern(pattern) : pattern).forEach(this._add, this);
        return this._added;
    }
    // Test one single path without recursively checking parent directories
    //
    // - checkUnignored `boolean` whether should check if the path is unignored,
    //   setting `checkUnignored` to `false` could reduce additional
    //   path matching.
    // - check `string` either `MODE_IGNORE` or `MODE_CHECK_IGNORE`
    // @returns {TestResult} true if a file is ignored
    test(path, checkUnignored, mode) {
        let ignored = false;
        let unignored = false;
        let matchedRule;
        this._rules.forEach((rule)=>{
            const { negative } = rule;
            //          |           ignored : unignored
            // -------- | ---------------------------------------
            // negative |   0:0   |   0:1   |   1:0   |   1:1
            // -------- | ------- | ------- | ------- | --------
            //     0    |  TEST   |  TEST   |  SKIP   |    X
            //     1    |  TESTIF |  SKIP   |  TEST   |    X
            // - SKIP: always skip
            // - TEST: always test
            // - TESTIF: only test if checkUnignored
            // - X: that never happen
            if (unignored === negative && ignored !== unignored || negative && !ignored && !unignored && !checkUnignored) {
                return;
            }
            const matched = rule[mode].test(path);
            if (!matched) {
                return;
            }
            ignored = !negative;
            unignored = negative;
            matchedRule = negative ? UNDEFINED : rule;
        });
        const ret = {
            ignored,
            unignored
        };
        if (matchedRule) {
            ret.rule = matchedRule;
        }
        return ret;
    }
}
const throwError = (message, Ctor)=>{
    throw new Ctor(message);
};
const checkPath = (path, originalPath, doThrow)=>{
    if (!isString(path)) {
        return doThrow(`path must be a string, but got \`${originalPath}\``, TypeError);
    }
    // We don't know if we should ignore EMPTY, so throw
    if (!path) {
        return doThrow(`path must not be empty`, TypeError);
    }
    // Check if it is a relative path
    if (checkPath.isNotRelative(path)) {
        const r = '`path.relative()`d';
        return doThrow(`path should be a ${r} string, but got "${originalPath}"`, RangeError);
    }
    return true;
};
const isNotRelative = (path)=>REGEX_TEST_INVALID_PATH.test(path);
checkPath.isNotRelative = isNotRelative;
// On windows, the following function will be replaced
/* istanbul ignore next */ checkPath.convert = (p)=>p;
class Ignore {
    constructor({ ignorecase = true, ignoreCase = ignorecase, allowRelativePaths = false } = {}){
        define(this, KEY_IGNORE, true);
        this._rules = new RuleManager(ignoreCase);
        this._strictPathCheck = !allowRelativePaths;
        this._initCache();
    }
    _initCache() {
        // A cache for the result of `.ignores()`
        this._ignoreCache = Object.create(null);
        // A cache for the result of `.test()`
        this._testCache = Object.create(null);
    }
    add(pattern) {
        if (this._rules.add(pattern)) {
            // Some rules have just added to the ignore,
            //   making the behavior changed,
            //   so we need to re-initialize the result cache
            this._initCache();
        }
        return this;
    }
    // legacy
    addPattern(pattern) {
        return this.add(pattern);
    }
    // @returns {TestResult}
    _test(originalPath, cache, checkUnignored, slices) {
        const path = originalPath && checkPath.convert(originalPath);
        checkPath(path, originalPath, this._strictPathCheck ? throwError : RETURN_FALSE);
        return this._t(path, cache, checkUnignored, slices);
    }
    checkIgnore(path) {
        // If the path doest not end with a slash, `.ignores()` is much equivalent
        //   to `git check-ignore`
        if (!REGEX_TEST_TRAILING_SLASH.test(path)) {
            return this.test(path);
        }
        const slices = path.split(SLASH).filter(Boolean);
        slices.pop();
        if (slices.length) {
            const parent = this._t(slices.join(SLASH) + SLASH, this._testCache, true, slices);
            if (parent.ignored) {
                return parent;
            }
        }
        return this._rules.test(path, false, MODE_CHECK_IGNORE);
    }
    _t(// The path to be tested
    path, // The cache for the result of a certain checking
    cache, // Whether should check if the path is unignored
    checkUnignored, // The path slices
    slices) {
        if (path in cache) {
            return cache[path];
        }
        if (!slices) {
            // path/to/a.js
            // ['path', 'to', 'a.js']
            slices = path.split(SLASH).filter(Boolean);
        }
        slices.pop();
        // If the path has no parent directory, just test it
        if (!slices.length) {
            return cache[path] = this._rules.test(path, checkUnignored, MODE_IGNORE);
        }
        const parent = this._t(slices.join(SLASH) + SLASH, cache, checkUnignored, slices);
        // If the path contains a parent directory, check the parent first
        return cache[path] = parent.ignored ? parent : this._rules.test(path, checkUnignored, MODE_IGNORE);
    }
    ignores(path) {
        return this._test(path, this._ignoreCache, false).ignored;
    }
    createFilter() {
        return (path)=>!this.ignores(path);
    }
    filter(paths) {
        return makeArray(paths).filter(this.createFilter());
    }
    // @returns {TestResult}
    test(path) {
        return this._test(path, this._testCache, true);
    }
}
const factory = (options)=>new Ignore(options);
const isPathValid = (path)=>checkPath(path && checkPath.convert(path), path, RETURN_FALSE);
/* istanbul ignore next */ const setupWindows = ()=>{
    /* eslint no-control-regex: "off" */ const makePosix = (str)=>/^\\\\\?\\/.test(str) || /["<>|\u0000-\u001F]+/u.test(str) ? str : str.replace(/\\/g, '/');
    checkPath.convert = makePosix;
    // 'C:\\foo'     <- 'C:\\foo' has been converted to 'C:/'
    // 'd:\\foo'
    const REGEX_TEST_WINDOWS_PATH_ABSOLUTE = /^[a-z]:\//i;
    checkPath.isNotRelative = (path)=>REGEX_TEST_WINDOWS_PATH_ABSOLUTE.test(path) || isNotRelative(path);
};
// Windows
// --------------------------------------------------------------
/* istanbul ignore next */ if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
;
// COMMONJS_EXPORTS ////////////////////////////////////////////////////////////
module.exports = factory;
// Although it is an anti-pattern,
//   it is still widely misused by a lot of libraries in github
// Ref: https://github.com/search?q=ignore.default%28%29&type=code
factory.default = factory;
module.exports.isPathValid = isPathValid;
// For testing purposes
define(module.exports, Symbol.for('setupWindows'), setupWindows);
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/Types.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseAnyOf.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseAnyOf = void 0;
const parseSchema_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseSchema.js [instrumentation] (ecmascript)");
const parseAnyOf = (schema, refs)=>{
    return schema.anyOf.length ? schema.anyOf.length === 1 ? (0, parseSchema_js_1.parseSchema)(schema.anyOf[0], {
        ...refs,
        path: [
            ...refs.path,
            "anyOf",
            0
        ]
    }) : `z.union([${schema.anyOf.map((schema, i)=>(0, parseSchema_js_1.parseSchema)(schema, {
            ...refs,
            path: [
                ...refs.path,
                "anyOf",
                i
            ]
        })).join(", ")}])` : `z.any()`;
};
exports.parseAnyOf = parseAnyOf;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseBoolean.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseBoolean = void 0;
const parseBoolean = (_schema)=>{
    return "z.boolean()";
};
exports.parseBoolean = parseBoolean;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseDefault.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseDefault = void 0;
const parseDefault = (_schema)=>{
    return "z.any()";
};
exports.parseDefault = parseDefault;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseMultipleType.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseMultipleType = void 0;
const parseSchema_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseSchema.js [instrumentation] (ecmascript)");
const parseMultipleType = (schema, refs)=>{
    return `z.union([${schema.type.map((type)=>(0, parseSchema_js_1.parseSchema)({
            ...schema,
            type
        }, {
            ...refs,
            withoutDefaults: true
        })).join(", ")}])`;
};
exports.parseMultipleType = parseMultipleType;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseNot.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseNot = void 0;
const parseSchema_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseSchema.js [instrumentation] (ecmascript)");
const parseNot = (schema, refs)=>{
    return `z.any().refine((value) => !${(0, parseSchema_js_1.parseSchema)(schema.not, {
        ...refs,
        path: [
            ...refs.path,
            "not"
        ]
    })}.safeParse(value).success, "Invalid input: Should NOT be valid against schema")`;
};
exports.parseNot = parseNot;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseNull.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseNull = void 0;
const parseNull = (_schema)=>{
    return "z.null()";
};
exports.parseNull = parseNull;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/utils/half.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.half = void 0;
const half = (arr)=>{
    return [
        arr.slice(0, arr.length / 2),
        arr.slice(arr.length / 2)
    ];
};
exports.half = half;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseAllOf.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseAllOf = void 0;
const parseSchema_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseSchema.js [instrumentation] (ecmascript)");
const half_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/utils/half.js [instrumentation] (ecmascript)");
const originalIndex = Symbol("Original index");
const ensureOriginalIndex = (arr)=>{
    let newArr = [];
    for(let i = 0; i < arr.length; i++){
        const item = arr[i];
        if (typeof item === "boolean") {
            newArr.push(item ? {
                [originalIndex]: i
            } : {
                [originalIndex]: i,
                not: {}
            });
        } else if (originalIndex in item) {
            return arr;
        } else {
            newArr.push({
                ...item,
                [originalIndex]: i
            });
        }
    }
    return newArr;
};
function parseAllOf(schema, refs) {
    if (schema.allOf.length === 0) {
        return "z.never()";
    } else if (schema.allOf.length === 1) {
        const item = schema.allOf[0];
        return (0, parseSchema_js_1.parseSchema)(item, {
            ...refs,
            path: [
                ...refs.path,
                "allOf",
                item[originalIndex]
            ]
        });
    } else {
        const [left, right] = (0, half_js_1.half)(ensureOriginalIndex(schema.allOf));
        return `z.intersection(${parseAllOf({
            allOf: left
        }, refs)}, ${parseAllOf({
            allOf: right
        }, refs)})`;
    }
}
exports.parseAllOf = parseAllOf;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/utils/withMessage.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.withMessage = void 0;
function withMessage(schema, key, get, fallbackMessage) {
    const value = schema[key];
    let r = "";
    if (value !== undefined) {
        const got = get({
            value,
            json: JSON.stringify(value)
        });
        if (got) {
            const opener = got[0];
            const prefix = got.length === 3 ? got[1] : "";
            const closer = got.length === 3 ? got[2] : got[1];
            r += opener;
            const message = schema.errorMessage?.[key] ?? fallbackMessage;
            if (message !== undefined) {
                r += prefix + JSON.stringify(message);
            }
            r;
            r += closer;
        }
    }
    return r;
}
exports.withMessage = withMessage;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseArray.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseArray = void 0;
const withMessage_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/utils/withMessage.js [instrumentation] (ecmascript)");
const parseSchema_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseSchema.js [instrumentation] (ecmascript)");
const parseArray = (schema, refs)=>{
    if (Array.isArray(schema.items)) {
        return `z.tuple([${schema.items.map((v, i)=>(0, parseSchema_js_1.parseSchema)(v, {
                ...refs,
                path: [
                    ...refs.path,
                    "items",
                    i
                ]
            }))}])`;
    }
    let r = !schema.items ? "z.array(z.any())" : `z.array(${(0, parseSchema_js_1.parseSchema)(schema.items, {
        ...refs,
        path: [
            ...refs.path,
            "items"
        ]
    })})`;
    r += (0, withMessage_js_1.withMessage)(schema, "minItems", ({ json })=>[
            `.min(${json}`,
            ", ",
            ")"
        ]);
    r += (0, withMessage_js_1.withMessage)(schema, "maxItems", ({ json })=>[
            `.max(${json}`,
            ", ",
            ")"
        ]);
    if (schema.uniqueItems === true) {
        r += (0, withMessage_js_1.withMessage)(schema, "uniqueItems", ()=>[
                ".refine((arr) => arr.every((item, i) => arr.indexOf(item) == i)",
                ", ",
                ")"
            ], "All items must be unique!");
    }
    return r;
};
exports.parseArray = parseArray;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseConst.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseConst = void 0;
const parseConst = (schema)=>{
    return `z.literal(${JSON.stringify(schema.const)})`;
};
exports.parseConst = parseConst;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseEnum.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseEnum = void 0;
const parseEnum = (schema)=>{
    if (schema.enum.length === 0) {
        return "z.never()";
    } else if (schema.enum.length === 1) {
        // union does not work when there is only one element
        return `z.literal(${JSON.stringify(schema.enum[0])})`;
    } else if (schema.enum.every((x)=>typeof x === "string")) {
        return `z.enum([${schema.enum.map((x)=>JSON.stringify(x))}])`;
    } else {
        return `z.union([${schema.enum.map((x)=>`z.literal(${JSON.stringify(x)})`).join(", ")}])`;
    }
};
exports.parseEnum = parseEnum;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseIfThenElse.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseIfThenElse = void 0;
const parseSchema_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseSchema.js [instrumentation] (ecmascript)");
const parseIfThenElse = (schema, refs)=>{
    const $if = (0, parseSchema_js_1.parseSchema)(schema.if, {
        ...refs,
        path: [
            ...refs.path,
            "if"
        ]
    });
    const $then = (0, parseSchema_js_1.parseSchema)(schema.then, {
        ...refs,
        path: [
            ...refs.path,
            "then"
        ]
    });
    const $else = (0, parseSchema_js_1.parseSchema)(schema.else, {
        ...refs,
        path: [
            ...refs.path,
            "else"
        ]
    });
    return `z.union([${$then}, ${$else}]).superRefine((value,ctx) => {
  const result = ${$if}.safeParse(value).success
    ? ${$then}.safeParse(value)
    : ${$else}.safeParse(value);
  if (!result.success) {
    result.error.errors.forEach((error) => ctx.addIssue(error))
  }
})`;
};
exports.parseIfThenElse = parseIfThenElse;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseNumber.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseNumber = void 0;
const withMessage_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/utils/withMessage.js [instrumentation] (ecmascript)");
const parseNumber = (schema)=>{
    let r = "z.number()";
    if (schema.type === "integer") {
        r += (0, withMessage_js_1.withMessage)(schema, "type", ()=>[
                ".int(",
                ")"
            ]);
    } else {
        r += (0, withMessage_js_1.withMessage)(schema, "format", ({ value })=>{
            if (value === "int64") {
                return [
                    ".int(",
                    ")"
                ];
            }
        });
    }
    r += (0, withMessage_js_1.withMessage)(schema, "multipleOf", ({ value, json })=>{
        if (value === 1) {
            if (r.startsWith("z.number().int(")) {
                return;
            }
            return [
                ".int(",
                ")"
            ];
        }
        return [
            `.multipleOf(${json}`,
            ", ",
            ")"
        ];
    });
    if (typeof schema.minimum === "number") {
        if (schema.exclusiveMinimum === true) {
            r += (0, withMessage_js_1.withMessage)(schema, "minimum", ({ json })=>[
                    `.gt(${json}`,
                    ", ",
                    ")"
                ]);
        } else {
            r += (0, withMessage_js_1.withMessage)(schema, "minimum", ({ json })=>[
                    `.gte(${json}`,
                    ", ",
                    ")"
                ]);
        }
    } else if (typeof schema.exclusiveMinimum === "number") {
        r += (0, withMessage_js_1.withMessage)(schema, "exclusiveMinimum", ({ json })=>[
                `.gt(${json}`,
                ", ",
                ")"
            ]);
    }
    if (typeof schema.maximum === "number") {
        if (schema.exclusiveMaximum === true) {
            r += (0, withMessage_js_1.withMessage)(schema, "maximum", ({ json })=>[
                    `.lt(${json}`,
                    ", ",
                    ")"
                ]);
        } else {
            r += (0, withMessage_js_1.withMessage)(schema, "maximum", ({ json })=>[
                    `.lte(${json}`,
                    ", ",
                    ")"
                ]);
        }
    } else if (typeof schema.exclusiveMaximum === "number") {
        r += (0, withMessage_js_1.withMessage)(schema, "exclusiveMaximum", ({ json })=>[
                `.lt(${json}`,
                ", ",
                ")"
            ]);
    }
    return r;
};
exports.parseNumber = parseNumber;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseOneOf.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseOneOf = void 0;
const parseSchema_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseSchema.js [instrumentation] (ecmascript)");
const parseOneOf = (schema, refs)=>{
    let is3 = refs.zodVersion === 3;
    return schema.oneOf.length ? schema.oneOf.length === 1 ? (0, parseSchema_js_1.parseSchema)(schema.oneOf[0], {
        ...refs,
        path: [
            ...refs.path,
            "oneOf",
            0
        ]
    }) : `z.any().superRefine((x, ctx) => {
    const schemas = [${schema.oneOf.map((schema, i)=>(0, parseSchema_js_1.parseSchema)(schema, {
            ...refs,
            path: [
                ...refs.path,
                "oneOf",
                i
            ]
        })).join(", ")}];
    const { errors, failed } = schemas.reduce<{
      errors: z.${is3 ? "ZodError" : "core.$ZodIssue"}[];
      failed: number;
    }>(
      ({ errors, failed }, schema) =>
        ((result) =>
          result.error
            ? {
                errors: [...errors, ${is3 ? "result.error" : "...result.error.issues"}],
                failed: failed + 1,
              }
            : { errors, failed })(
          schema.safeParse(x),
        ),
      { errors: [], failed: 0 },
    );
    const passed = schemas.length - failed;
    if (passed !== 1) {
      ctx.addIssue(errors.length ? {
        path: ${is3 ? "ctx.path" : "[]"},
        code: "invalid_union",
        ${is3 ? "unionErrors: errors" : "errors: [errors]"},
        message: "Invalid input: Should pass single schema. Passed " + passed,
      } : {
        path: ${is3 ? "ctx.path" : "[]"},
        code: "custom",${is3 ? "" : "\n        errors: [errors],"}
        message: "Invalid input: Should pass single schema. Passed " + passed,
      });
    }
  })` : "z.any()";
};
exports.parseOneOf = parseOneOf;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/utils/jsdocs.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.addJsdocs = exports.expandJsdocs = void 0;
const expandJsdocs = (jsdocs)=>{
    const lines = jsdocs.split("\n");
    const result = lines.length === 1 ? lines[0] : `\n${lines.map((x)=>`* ${x}`).join("\n")}\n`;
    return `/**${result}*/\n`;
};
exports.expandJsdocs = expandJsdocs;
const addJsdocs = (schema, parsed)=>{
    const description = schema.description;
    if (!description) {
        return parsed;
    }
    return `\n${(0, exports.expandJsdocs)(description)}${parsed}`;
};
exports.addJsdocs = addJsdocs;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseObject.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseObject = void 0;
const parseAnyOf_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseAnyOf.js [instrumentation] (ecmascript)");
const parseOneOf_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseOneOf.js [instrumentation] (ecmascript)");
const parseSchema_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseSchema.js [instrumentation] (ecmascript)");
const parseAllOf_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseAllOf.js [instrumentation] (ecmascript)");
const jsdocs_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/utils/jsdocs.js [instrumentation] (ecmascript)");
// Helper for z.record() generation - Zod v4 requires explicit key type
function emitRecord(valueSchema, refs) {
    if (refs.zodVersion === 3) {
        return `z.record(${valueSchema})`;
    }
    // Default to v4 syntax
    return `z.record(z.string(), ${valueSchema})`;
}
// Helper for error path in superRefine - Zod v4 uses simplified path
function emitErrorPath(refs) {
    if (refs.zodVersion === 3) {
        return `path: [...ctx.path, key]`;
    }
    // Default to v4 syntax
    return `path: [key]`;
}
function parseObject(objectSchema, refs) {
    let properties = undefined;
    if (objectSchema.properties) {
        if (!Object.keys(objectSchema.properties).length) {
            properties = "z.object({})";
        } else {
            properties = "z.object({ ";
            properties += Object.keys(objectSchema.properties).map((key)=>{
                const propSchema = objectSchema.properties[key];
                let result = `${JSON.stringify(key)}: ${(0, parseSchema_js_1.parseSchema)(propSchema, {
                    ...refs,
                    path: [
                        ...refs.path,
                        "properties",
                        key
                    ]
                })}`;
                if (refs.withJsdocs && typeof propSchema === "object") {
                    result = (0, jsdocs_js_1.addJsdocs)(propSchema, result);
                }
                const hasDefault = typeof propSchema === "object" && propSchema.default !== undefined;
                const required = Array.isArray(objectSchema.required) ? objectSchema.required.includes(key) : typeof propSchema === "object" && propSchema.required === true;
                const optional = !hasDefault && !required;
                return optional ? `${result}.optional()` : result;
            }).join(", ");
            properties += " })";
        }
    }
    const additionalProperties = objectSchema.additionalProperties !== undefined ? (0, parseSchema_js_1.parseSchema)(objectSchema.additionalProperties, {
        ...refs,
        path: [
            ...refs.path,
            "additionalProperties"
        ]
    }) : undefined;
    let patternProperties = undefined;
    if (objectSchema.patternProperties) {
        const parsedPatternProperties = Object.fromEntries(Object.entries(objectSchema.patternProperties).map(([key, value])=>{
            return [
                key,
                (0, parseSchema_js_1.parseSchema)(value, {
                    ...refs,
                    path: [
                        ...refs.path,
                        "patternProperties",
                        key
                    ]
                })
            ];
        }, {}));
        patternProperties = "";
        if (properties) {
            if (additionalProperties) {
                patternProperties += `.catchall(z.union([${[
                    ...Object.values(parsedPatternProperties),
                    additionalProperties
                ].join(", ")}]))`;
            } else if (Object.keys(parsedPatternProperties).length > 1) {
                patternProperties += `.catchall(z.union([${Object.values(parsedPatternProperties).join(", ")}]))`;
            } else {
                patternProperties += `.catchall(${Object.values(parsedPatternProperties)})`;
            }
        } else {
            if (additionalProperties) {
                patternProperties += emitRecord(`z.union([${[
                    ...Object.values(parsedPatternProperties),
                    additionalProperties
                ].join(", ")}])`, refs);
            } else if (Object.keys(parsedPatternProperties).length > 1) {
                patternProperties += emitRecord(`z.union([${Object.values(parsedPatternProperties).join(", ")}])`, refs);
            } else {
                patternProperties += emitRecord(`${Object.values(parsedPatternProperties)}`, refs);
            }
        }
        patternProperties += ".superRefine((value, ctx) => {\n";
        patternProperties += "for (const key in value) {\n";
        if (additionalProperties) {
            if (objectSchema.properties) {
                patternProperties += `let evaluated = [${Object.keys(objectSchema.properties).map((key)=>JSON.stringify(key)).join(", ")}].includes(key)\n`;
            } else {
                patternProperties += `let evaluated = false\n`;
            }
        }
        for(const key in objectSchema.patternProperties){
            patternProperties += "if (key.match(new RegExp(" + JSON.stringify(key) + "))) {\n";
            if (additionalProperties) {
                patternProperties += "evaluated = true\n";
            }
            patternProperties += "const result = " + parsedPatternProperties[key] + ".safeParse(value[key])\n";
            patternProperties += "if (!result.success) {\n";
            patternProperties += `ctx.addIssue({
          ${emitErrorPath(refs)},
          code: 'custom',
          message: \`Invalid input: Key matching regex /\${key}/ must match schema\`,
          params: {
            issues: result.error.issues
          }
        })\n`;
            patternProperties += "}\n";
            patternProperties += "}\n";
        }
        if (additionalProperties) {
            patternProperties += "if (!evaluated) {\n";
            patternProperties += "const result = " + additionalProperties + ".safeParse(value[key])\n";
            patternProperties += "if (!result.success) {\n";
            patternProperties += `ctx.addIssue({
          ${emitErrorPath(refs)},
          code: 'custom',
          message: \`Invalid input: must match catchall schema\`,
          params: {
            issues: result.error.issues
          }
        })\n`;
            patternProperties += "}\n";
            patternProperties += "}\n";
        }
        patternProperties += "}\n";
        patternProperties += "})";
    }
    let output = properties ? patternProperties ? properties + patternProperties : additionalProperties ? additionalProperties === "z.never()" ? properties + ".strict()" : properties + `.catchall(${additionalProperties})` : properties : patternProperties ? patternProperties : additionalProperties ? emitRecord(additionalProperties, refs) : emitRecord("z.any()", refs);
    if (parseSchema_js_1.its.an.anyOf(objectSchema)) {
        output += `.and(${(0, parseAnyOf_js_1.parseAnyOf)({
            ...objectSchema,
            anyOf: objectSchema.anyOf.map((x)=>typeof x === "object" && !x.type && (x.properties || x.additionalProperties || x.patternProperties) ? {
                    ...x,
                    type: "object"
                } : x)
        }, refs)})`;
    }
    if (parseSchema_js_1.its.a.oneOf(objectSchema)) {
        output += `.and(${(0, parseOneOf_js_1.parseOneOf)({
            ...objectSchema,
            oneOf: objectSchema.oneOf.map((x)=>typeof x === "object" && !x.type && (x.properties || x.additionalProperties || x.patternProperties) ? {
                    ...x,
                    type: "object"
                } : x)
        }, refs)})`;
    }
    if (parseSchema_js_1.its.an.allOf(objectSchema)) {
        output += `.and(${(0, parseAllOf_js_1.parseAllOf)({
            ...objectSchema,
            allOf: objectSchema.allOf.map((x)=>typeof x === "object" && !x.type && (x.properties || x.additionalProperties || x.patternProperties) ? {
                    ...x,
                    type: "object"
                } : x)
        }, refs)})`;
    }
    return output;
}
exports.parseObject = parseObject;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseString.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseString = void 0;
const withMessage_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/utils/withMessage.js [instrumentation] (ecmascript)");
const parseSchema_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseSchema.js [instrumentation] (ecmascript)");
const parseString = (schema)=>{
    let r = "z.string()";
    r += (0, withMessage_js_1.withMessage)(schema, "format", ({ value })=>{
        switch(value){
            case "email":
                return [
                    ".email(",
                    ")"
                ];
            case "ip":
                return [
                    ".ip(",
                    ")"
                ];
            case "ipv4":
                return [
                    '.ip({ version: "v4"',
                    ", message: ",
                    " })"
                ];
            case "ipv6":
                return [
                    '.ip({ version: "v6"',
                    ", message: ",
                    " })"
                ];
            case "uri":
                return [
                    ".url(",
                    ")"
                ];
            case "uuid":
                return [
                    ".uuid(",
                    ")"
                ];
            case "date-time":
                return [
                    ".datetime({ offset: true",
                    ", message: ",
                    " })"
                ];
            case "time":
                return [
                    ".time(",
                    ")"
                ];
            case "date":
                return [
                    ".date(",
                    ")"
                ];
            case "binary":
                return [
                    ".base64(",
                    ")"
                ];
            case "duration":
                return [
                    ".duration(",
                    ")"
                ];
        }
    });
    r += (0, withMessage_js_1.withMessage)(schema, "pattern", ({ json })=>[
            `.regex(new RegExp(${json})`,
            ", ",
            ")"
        ]);
    r += (0, withMessage_js_1.withMessage)(schema, "minLength", ({ json })=>[
            `.min(${json}`,
            ", ",
            ")"
        ]);
    r += (0, withMessage_js_1.withMessage)(schema, "maxLength", ({ json })=>[
            `.max(${json}`,
            ", ",
            ")"
        ]);
    r += (0, withMessage_js_1.withMessage)(schema, "contentEncoding", ({ value })=>{
        if (value === "base64") {
            return [
                ".base64(",
                ")"
            ];
        }
    });
    const contentMediaType = (0, withMessage_js_1.withMessage)(schema, "contentMediaType", ({ value })=>{
        if (value === "application/json") {
            return [
                ".transform((str, ctx) => { try { return JSON.parse(str); } catch (err) { ctx.addIssue({ code: \"custom\", message: \"Invalid JSON\" }); }}",
                ", ",
                ")"
            ];
        }
    });
    if (contentMediaType != "") {
        r += contentMediaType;
        r += (0, withMessage_js_1.withMessage)(schema, "contentSchema", ({ value })=>{
            if (value && value instanceof Object) {
                return [
                    `.pipe(${(0, parseSchema_js_1.parseSchema)(value)}`,
                    ", ",
                    ")"
                ];
            }
        });
    }
    return r;
};
exports.parseString = parseString;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseSimpleDiscriminatedOneOf.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseSimpleDiscriminatedOneOf = void 0;
const parseSchema_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseSchema.js [instrumentation] (ecmascript)");
const parseSimpleDiscriminatedOneOf = (schema, refs)=>{
    return schema.oneOf.length ? schema.oneOf.length === 1 ? (0, parseSchema_js_1.parseSchema)(schema.oneOf[0], {
        ...refs,
        path: [
            ...refs.path,
            "oneOf",
            0
        ]
    }) : `z.discriminatedUnion("${schema.discriminator.propertyName}", [${schema.oneOf.map((schema, i)=>(0, parseSchema_js_1.parseSchema)(schema, {
            ...refs,
            path: [
                ...refs.path,
                "oneOf",
                i
            ]
        })).join(", ")}])` : "z.any()";
};
exports.parseSimpleDiscriminatedOneOf = parseSimpleDiscriminatedOneOf;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/utils/omit.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.omit = void 0;
const omit = (obj, ...keys)=>Object.keys(obj).reduce((acc, key)=>{
        if (!keys.includes(key)) {
            acc[key] = obj[key];
        }
        return acc;
    }, {});
exports.omit = omit;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseNullable.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.parseNullable = void 0;
const omit_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/utils/omit.js [instrumentation] (ecmascript)");
const parseSchema_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseSchema.js [instrumentation] (ecmascript)");
/**
 * For compatibility with open api 3.0 nullable
 */ const parseNullable = (schema, refs)=>{
    return `${(0, parseSchema_js_1.parseSchema)((0, omit_js_1.omit)(schema, "nullable"), refs, true)}.nullable()`;
};
exports.parseNullable = parseNullable;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseSchema.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.its = exports.parseSchema = void 0;
const parseAnyOf_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseAnyOf.js [instrumentation] (ecmascript)");
const parseBoolean_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseBoolean.js [instrumentation] (ecmascript)");
const parseDefault_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseDefault.js [instrumentation] (ecmascript)");
const parseMultipleType_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseMultipleType.js [instrumentation] (ecmascript)");
const parseNot_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseNot.js [instrumentation] (ecmascript)");
const parseNull_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseNull.js [instrumentation] (ecmascript)");
const parseAllOf_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseAllOf.js [instrumentation] (ecmascript)");
const parseArray_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseArray.js [instrumentation] (ecmascript)");
const parseConst_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseConst.js [instrumentation] (ecmascript)");
const parseEnum_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseEnum.js [instrumentation] (ecmascript)");
const parseIfThenElse_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseIfThenElse.js [instrumentation] (ecmascript)");
const parseNumber_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseNumber.js [instrumentation] (ecmascript)");
const parseObject_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseObject.js [instrumentation] (ecmascript)");
const parseString_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseString.js [instrumentation] (ecmascript)");
const parseOneOf_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseOneOf.js [instrumentation] (ecmascript)");
const parseSimpleDiscriminatedOneOf_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseSimpleDiscriminatedOneOf.js [instrumentation] (ecmascript)");
const parseNullable_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseNullable.js [instrumentation] (ecmascript)");
const parseSchema = (schema, refs = {
    seen: new Map(),
    path: []
}, blockMeta)=>{
    if (typeof schema !== "object") return schema ? "z.any()" : "z.never()";
    if (refs.parserOverride) {
        const custom = refs.parserOverride(schema, refs);
        if (typeof custom === "string") {
            return custom;
        }
    }
    let seen = refs.seen.get(schema);
    if (seen) {
        if (seen.r !== undefined) {
            return seen.r;
        }
        if (refs.depth === undefined || seen.n >= refs.depth) {
            return "z.any()";
        }
        seen.n += 1;
    } else {
        seen = {
            r: undefined,
            n: 0
        };
        refs.seen.set(schema, seen);
    }
    let parsed = selectParser(schema, refs);
    if (!blockMeta) {
        if (!refs.withoutDescribes) {
            parsed = addDescribes(schema, parsed);
        }
        if (!refs.withoutDefaults) {
            parsed = addDefaults(schema, parsed);
        }
        parsed = addAnnotations(schema, parsed);
    }
    seen.r = parsed;
    return parsed;
};
exports.parseSchema = parseSchema;
const addDescribes = (schema, parsed)=>{
    if (schema.description) {
        parsed += `.describe(${JSON.stringify(schema.description)})`;
    }
    return parsed;
};
const addDefaults = (schema, parsed)=>{
    if (schema.default !== undefined) {
        parsed += `.default(${JSON.stringify(schema.default)})`;
    }
    return parsed;
};
const addAnnotations = (schema, parsed)=>{
    if (schema.readOnly) {
        parsed += ".readonly()";
    }
    return parsed;
};
const selectParser = (schema, refs)=>{
    if (exports.its.a.nullable(schema)) {
        return (0, parseNullable_js_1.parseNullable)(schema, refs);
    } else if (exports.its.an.object(schema)) {
        return (0, parseObject_js_1.parseObject)(schema, refs);
    } else if (exports.its.an.array(schema)) {
        return (0, parseArray_js_1.parseArray)(schema, refs);
    } else if (exports.its.an.anyOf(schema)) {
        return (0, parseAnyOf_js_1.parseAnyOf)(schema, refs);
    } else if (exports.its.an.allOf(schema)) {
        return (0, parseAllOf_js_1.parseAllOf)(schema, refs);
    } else if (exports.its.a.simpleDiscriminatedOneOf(schema)) {
        return (0, parseSimpleDiscriminatedOneOf_js_1.parseSimpleDiscriminatedOneOf)(schema, refs);
    } else if (exports.its.a.oneOf(schema)) {
        return (0, parseOneOf_js_1.parseOneOf)(schema, refs);
    } else if (exports.its.a.not(schema)) {
        return (0, parseNot_js_1.parseNot)(schema, refs);
    } else if (exports.its.an.enum(schema)) {
        return (0, parseEnum_js_1.parseEnum)(schema); //<-- needs to come before primitives
    } else if (exports.its.a.const(schema)) {
        return (0, parseConst_js_1.parseConst)(schema);
    } else if (exports.its.a.multipleType(schema)) {
        return (0, parseMultipleType_js_1.parseMultipleType)(schema, refs);
    } else if (exports.its.a.primitive(schema, "string")) {
        return (0, parseString_js_1.parseString)(schema);
    } else if (exports.its.a.primitive(schema, "number") || exports.its.a.primitive(schema, "integer")) {
        return (0, parseNumber_js_1.parseNumber)(schema);
    } else if (exports.its.a.primitive(schema, "boolean")) {
        return (0, parseBoolean_js_1.parseBoolean)(schema);
    } else if (exports.its.a.primitive(schema, "null")) {
        return (0, parseNull_js_1.parseNull)(schema);
    } else if (exports.its.a.conditional(schema)) {
        return (0, parseIfThenElse_js_1.parseIfThenElse)(schema, refs);
    } else {
        return (0, parseDefault_js_1.parseDefault)(schema);
    }
};
exports.its = {
    an: {
        object: (x)=>x.type === "object",
        array: (x)=>x.type === "array",
        anyOf: (x)=>x.anyOf !== undefined,
        allOf: (x)=>x.allOf !== undefined,
        enum: (x)=>x.enum !== undefined
    },
    a: {
        nullable: (x)=>x.nullable === true,
        multipleType: (x)=>Array.isArray(x.type),
        not: (x)=>x.not !== undefined,
        const: (x)=>x.const !== undefined,
        primitive: (x, p)=>x.type === p,
        conditional: (x)=>Boolean("if" in x && x.if && "then" in x && "else" in x && x.then && x.else),
        simpleDiscriminatedOneOf: (x)=>{
            if (!x.oneOf || !Array.isArray(x.oneOf) || x.oneOf.length === 0 || !x.discriminator || typeof x.discriminator !== "object" || !("propertyName" in x.discriminator) || typeof x.discriminator.propertyName !== "string") {
                return false;
            }
            const discriminatorProp = x.discriminator.propertyName;
            return x.oneOf.every((schema)=>{
                if (!schema || typeof schema !== "object" || schema.type !== "object" || !schema.properties || typeof schema.properties !== "object" || !(discriminatorProp in schema.properties)) {
                    return false;
                }
                const property = schema.properties[discriminatorProp];
                return property && typeof property === "object" && property.type === "string" && // Ensure discriminator has a constant value (const or single-value enum)
                (property.const !== undefined || property.enum && Array.isArray(property.enum) && property.enum.length === 1) && // Ensure discriminator property is required
                Array.isArray(schema.required) && schema.required.includes(discriminatorProp);
            });
        },
        oneOf: (x)=>x.oneOf !== undefined
    }
};
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/jsonSchemaToZod.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.jsonSchemaToZod = void 0;
const parseSchema_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseSchema.js [instrumentation] (ecmascript)");
const jsdocs_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/utils/jsdocs.js [instrumentation] (ecmascript)");
const jsonSchemaToZod = (schema, { module, name, type, noImport, zodVersion = 4, ...rest } = {})=>{
    if (type && (!name || module !== "esm")) {
        throw new Error("Option `type` requires `name` to be set and `module` to be `esm`");
    }
    let result = (0, parseSchema_js_1.parseSchema)(schema, {
        module,
        name,
        path: [],
        seen: new Map(),
        zodVersion,
        ...rest
    });
    const jsdocs = rest.withJsdocs && typeof schema !== "boolean" && schema.description ? (0, jsdocs_js_1.expandJsdocs)(schema.description) : "";
    if (module === "cjs") {
        result = `${jsdocs}module.exports = ${name ? `{ ${JSON.stringify(name)}: ${result} }` : result}
`;
        if (!noImport) {
            result = `${jsdocs}const { z } = require("zod")

${result}`;
        }
    } else if (module === "esm") {
        result = `${jsdocs}export ${name ? `const ${name} =` : `default`} ${result}
`;
        if (!noImport) {
            result = `import { z } from "zod"

${result}`;
        }
    } else if (name) {
        result = `${jsdocs}const ${name} = ${result}`;
    }
    if (type && name) {
        let typeName = typeof type === "string" ? type : `${name[0].toUpperCase()}${name.substring(1)}`;
        result += `export type ${typeName} = z.infer<typeof ${name}>
`;
    }
    return result;
};
exports.jsonSchemaToZod = jsonSchemaToZod;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/index.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var __createBinding = /*TURBOPACK member replacement*/ __turbopack_context__.e && /*TURBOPACK member replacement*/ __turbopack_context__.e.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = {
            enumerable: true,
            get: function() {
                return m[k];
            }
        };
    }
    Object.defineProperty(o, k2, desc);
} : function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
});
var __exportStar = /*TURBOPACK member replacement*/ __turbopack_context__.e && /*TURBOPACK member replacement*/ __turbopack_context__.e.__exportStar || function(m, exports1) {
    for(var p in m)if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports1, p)) __createBinding(exports1, m, p);
};
Object.defineProperty(exports, "__esModule", {
    value: true
});
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/Types.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/jsonSchemaToZod.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseAllOf.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseAnyOf.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseArray.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseBoolean.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseConst.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseDefault.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseEnum.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseIfThenElse.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseMultipleType.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseNot.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseNull.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseNullable.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseNumber.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseObject.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseOneOf.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseSchema.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseSimpleDiscriminatedOneOf.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/parsers/parseString.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/utils/half.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/utils/jsdocs.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/utils/omit.js [instrumentation] (ecmascript)"), exports);
__exportStar(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/utils/withMessage.js [instrumentation] (ecmascript)"), exports);
const jsonSchemaToZod_js_1 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/json-schema-to-zod@2.8.1/node_modules/json-schema-to-zod/dist/cjs/jsonSchemaToZod.js [instrumentation] (ecmascript)");
exports.default = jsonSchemaToZod_js_1.jsonSchemaToZod;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-from-json-schema@0.5.2/node_modules/zod-from-json-schema/dist/index.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all)=>{
    for(var name in all)__defProp(target, name, {
        get: all[name],
        enumerable: true
    });
};
var __copyProps = (to, from, except, desc)=>{
    if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames(from))if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
            get: ()=>from[key],
            enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
    }
    return to;
};
var __toCommonJS = (mod)=>__copyProps(__defProp({}, "__esModule", {
        value: true
    }), mod);
// src/index.ts
var index_exports = {};
__export(index_exports, {
    convertJsonSchemaToZod: ()=>convertJsonSchemaToZod,
    createUniqueItemsValidator: ()=>createUniqueItemsValidator,
    isValidWithSchema: ()=>isValidWithSchema,
    jsonSchemaObjectToZodRawShape: ()=>jsonSchemaObjectToZodRawShape
});
module.exports = __toCommonJS(index_exports);
// src/core/converter.ts
var import_v414 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/index.cjs [instrumentation] (ecmascript)");
// src/handlers/primitive/type.ts
var import_v4 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/index.cjs [instrumentation] (ecmascript)");
var TypeHandler = class {
    apply(types, schema) {
        if (!schema.type) return;
        const allowedTypes = Array.isArray(schema.type) ? schema.type : [
            schema.type
        ];
        const typeSet = new Set(allowedTypes);
        if (!typeSet.has("string")) {
            types.string = false;
        }
        if (!typeSet.has("number") && !typeSet.has("integer")) {
            types.number = false;
        }
        if (!typeSet.has("boolean")) {
            types.boolean = false;
        }
        if (!typeSet.has("null")) {
            types.null = false;
        }
        if (!typeSet.has("array")) {
            types.array = false;
        }
        if (!typeSet.has("object")) {
            types.object = false;
        }
        if (typeSet.has("integer") && types.number !== false) {
            const currentNumber = types.number || import_v4.z.number();
            if (currentNumber instanceof import_v4.z.ZodNumber) {
                types.number = currentNumber.int();
            }
        }
    }
};
// src/handlers/primitive/const.ts
var import_v42 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/index.cjs [instrumentation] (ecmascript)");
var ConstHandler = class {
    apply(types, schema) {
        if (schema.const === void 0) return;
        const constValue = schema.const;
        types.string = false;
        types.number = false;
        types.boolean = false;
        types.null = false;
        types.array = false;
        types.object = false;
        if (typeof constValue === "string") {
            types.string = import_v42.z.literal(constValue);
        } else if (typeof constValue === "number") {
            types.number = import_v42.z.literal(constValue);
        } else if (typeof constValue === "boolean") {
            types.boolean = import_v42.z.literal(constValue);
        } else if (constValue === null) {
            types.null = import_v42.z.null();
        } else if (Array.isArray(constValue)) {
            types.array = void 0;
        } else if (typeof constValue === "object") {
            types.object = void 0;
        }
    }
};
// src/handlers/primitive/enum.ts
var import_v43 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/index.cjs [instrumentation] (ecmascript)");
var EnumHandler = class {
    apply(types, schema) {
        if (!schema.enum) return;
        if (schema.enum.length === 0) {
            if (!schema.type) {
                types.string = false;
                types.number = false;
                types.boolean = false;
                types.null = false;
                types.array = false;
                types.object = false;
            }
            return;
        }
        const valuesByType = {
            string: schema.enum.filter((v)=>typeof v === "string"),
            number: schema.enum.filter((v)=>typeof v === "number"),
            boolean: schema.enum.filter((v)=>typeof v === "boolean"),
            null: schema.enum.filter((v)=>v === null),
            array: schema.enum.filter((v)=>Array.isArray(v)),
            object: schema.enum.filter((v)=>typeof v === "object" && v !== null && !Array.isArray(v))
        };
        types.string = this.createTypeSchema(valuesByType.string, "string");
        types.number = this.createTypeSchema(valuesByType.number, "number");
        types.boolean = this.createTypeSchema(valuesByType.boolean, "boolean");
        types.null = valuesByType.null.length > 0 ? import_v43.z.null() : false;
        types.array = valuesByType.array.length > 0 ? void 0 : false;
        types.object = valuesByType.object.length > 0 ? void 0 : false;
    }
    createTypeSchema(values, type) {
        if (values.length === 0) return false;
        if (values.length === 1) {
            return import_v43.z.literal(values[0]);
        }
        if (type === "string") {
            return import_v43.z.enum(values);
        }
        if (type === "number") {
            const [first, second, ...rest] = values;
            return import_v43.z.union([
                import_v43.z.literal(first),
                import_v43.z.literal(second),
                ...rest.map((v)=>import_v43.z.literal(v))
            ]);
        }
        if (type === "boolean") {
            return import_v43.z.union([
                import_v43.z.literal(true),
                import_v43.z.literal(false)
            ]);
        }
        return false;
    }
};
// src/handlers/primitive/file.ts
var import_v44 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/index.cjs [instrumentation] (ecmascript)");
var FileHandler = class {
    apply(types, schema) {
        const stringSchema = schema;
        if (stringSchema.type === "string" && stringSchema.format === "binary" && stringSchema.contentEncoding === "binary") {
            let fileSchema = import_v44.z.file();
            if (stringSchema.minLength !== void 0) {
                fileSchema = fileSchema.min(stringSchema.minLength);
            }
            if (stringSchema.maxLength !== void 0) {
                fileSchema = fileSchema.max(stringSchema.maxLength);
            }
            if (stringSchema.contentMediaType !== void 0) {
                fileSchema = fileSchema.mime(stringSchema.contentMediaType);
            }
            types.file = fileSchema;
            types.string = false;
        }
    }
};
// src/handlers/primitive/string.ts
var import_v45 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/index.cjs [instrumentation] (ecmascript)");
var ImplicitStringHandler = class {
    apply(types, schema) {
        const stringSchema = schema;
        if (schema.type === void 0 && (stringSchema.minLength !== void 0 || stringSchema.maxLength !== void 0 || stringSchema.pattern !== void 0)) {
            if (types.string === void 0) {
                types.string = import_v45.z.string();
            }
        }
    }
};
var MinLengthHandler = class {
    apply(types, schema) {
        const stringSchema = schema;
        if (stringSchema.minLength === void 0) return;
        if (types.string !== false) {
            const currentString = types.string || import_v45.z.string();
            if (currentString instanceof import_v45.z.ZodString) {
                types.string = currentString.refine((value)=>{
                    const graphemeLength = Array.from(value).length;
                    return graphemeLength >= stringSchema.minLength;
                }, {
                    message: `String must be at least ${stringSchema.minLength} characters long`
                });
            }
        }
    }
};
var MaxLengthHandler = class {
    apply(types, schema) {
        const stringSchema = schema;
        if (stringSchema.maxLength === void 0) return;
        if (types.string !== false) {
            const currentString = types.string || import_v45.z.string();
            if (currentString instanceof import_v45.z.ZodString) {
                types.string = currentString.refine((value)=>{
                    const graphemeLength = Array.from(value).length;
                    return graphemeLength <= stringSchema.maxLength;
                }, {
                    message: `String must be at most ${stringSchema.maxLength} characters long`
                });
            }
        }
    }
};
var PatternHandler = class {
    apply(types, schema) {
        const stringSchema = schema;
        if (!stringSchema.pattern) return;
        if (types.string !== false) {
            const currentString = types.string || import_v45.z.string();
            if (currentString instanceof import_v45.z.ZodString) {
                const regex = new RegExp(stringSchema.pattern);
                types.string = currentString.regex(regex);
            }
        }
    }
};
// src/handlers/primitive/number.ts
var import_v46 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/index.cjs [instrumentation] (ecmascript)");
var MinimumHandler = class {
    apply(types, schema) {
        const numberSchema = schema;
        if (numberSchema.minimum === void 0) return;
        if (types.number !== false) {
            const currentNumber = types.number || import_v46.z.number();
            if (currentNumber instanceof import_v46.z.ZodNumber) {
                types.number = currentNumber.min(numberSchema.minimum);
            }
        }
    }
};
var MaximumHandler = class {
    apply(types, schema) {
        const numberSchema = schema;
        if (numberSchema.maximum === void 0) return;
        if (types.number !== false) {
            const currentNumber = types.number || import_v46.z.number();
            if (currentNumber instanceof import_v46.z.ZodNumber) {
                types.number = currentNumber.max(numberSchema.maximum);
            }
        }
    }
};
var ExclusiveMinimumHandler = class {
    apply(types, schema) {
        const numberSchema = schema;
        if (numberSchema.exclusiveMinimum === void 0) return;
        if (types.number !== false) {
            const currentNumber = types.number || import_v46.z.number();
            if (currentNumber instanceof import_v46.z.ZodNumber) {
                if (typeof numberSchema.exclusiveMinimum === "number") {
                    types.number = currentNumber.gt(numberSchema.exclusiveMinimum);
                } else {
                    types.number = false;
                }
            }
        }
    }
};
var ExclusiveMaximumHandler = class {
    apply(types, schema) {
        const numberSchema = schema;
        if (numberSchema.exclusiveMaximum === void 0) return;
        if (types.number !== false) {
            const currentNumber = types.number || import_v46.z.number();
            if (currentNumber instanceof import_v46.z.ZodNumber) {
                if (typeof numberSchema.exclusiveMaximum === "number") {
                    types.number = currentNumber.lt(numberSchema.exclusiveMaximum);
                } else {
                    types.number = false;
                }
            }
        }
    }
};
var MultipleOfHandler = class {
    apply(types, schema) {
        const numberSchema = schema;
        if (numberSchema.multipleOf === void 0) return;
        if (types.number !== false) {
            const currentNumber = types.number || import_v46.z.number();
            if (currentNumber instanceof import_v46.z.ZodNumber) {
                types.number = currentNumber.refine((value)=>{
                    if (numberSchema.multipleOf === 0) return false;
                    const quotient = value / numberSchema.multipleOf;
                    const rounded = Math.round(quotient);
                    const tolerance = Math.min(Math.abs(value) * Number.EPSILON * 10, Math.abs(numberSchema.multipleOf) * Number.EPSILON * 10);
                    return Math.abs(quotient - rounded) <= tolerance / Math.abs(numberSchema.multipleOf);
                }, {
                    message: `Must be a multiple of ${numberSchema.multipleOf}`
                });
            }
        }
    }
};
// src/handlers/primitive/array.ts
var import_v47 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/index.cjs [instrumentation] (ecmascript)");
var ImplicitArrayHandler = class {
    apply(types, schema) {
        const arraySchema = schema;
        if (schema.type === void 0 && (arraySchema.minItems !== void 0 || arraySchema.maxItems !== void 0 || arraySchema.items !== void 0 || arraySchema.prefixItems !== void 0)) {
            if (types.array === void 0) {
                types.array = import_v47.z.array(import_v47.z.any());
            }
        }
    }
};
var MinItemsHandler = class {
    apply(types, schema) {
        const arraySchema = schema;
        if (arraySchema.minItems === void 0) return;
        if (types.array !== false) {
            types.array = (types.array || import_v47.z.array(import_v47.z.any())).min(arraySchema.minItems);
        }
    }
};
var MaxItemsHandler = class {
    apply(types, schema) {
        const arraySchema = schema;
        if (arraySchema.maxItems === void 0) return;
        if (types.array !== false) {
            types.array = (types.array || import_v47.z.array(import_v47.z.any())).max(arraySchema.maxItems);
        }
    }
};
var ItemsHandler = class {
    apply(types, schema) {
        const arraySchema = schema;
        if (types.array === false) return;
        if (Array.isArray(arraySchema.items)) {
            types.array = types.array || import_v47.z.array(import_v47.z.any());
        } else if (arraySchema.items && typeof arraySchema.items !== "boolean" && !arraySchema.prefixItems) {
            const itemSchema = convertJsonSchemaToZod(arraySchema.items);
            let newArray = import_v47.z.array(itemSchema);
            if (types.array && types.array instanceof import_v47.z.ZodArray) {
                const existingDef = types.array._def;
                if (existingDef.checks) {
                    existingDef.checks.forEach((check)=>{
                        if (check._zod && check._zod.def) {
                            const def = check._zod.def;
                            if (def.check === "min_length" && def.minimum !== void 0) {
                                newArray = newArray.min(def.minimum);
                            } else if (def.check === "max_length" && def.maximum !== void 0) {
                                newArray = newArray.max(def.maximum);
                            }
                        }
                    });
                }
            }
            types.array = newArray;
        } else if (typeof arraySchema.items === "boolean" && arraySchema.items === false) {
            if (!arraySchema.prefixItems) {
                types.array = import_v47.z.array(import_v47.z.any()).max(0);
            } else {
                types.array = types.array || import_v47.z.array(import_v47.z.any());
            }
        } else if (typeof arraySchema.items === "boolean" && arraySchema.items === true) {
            types.array = types.array || import_v47.z.array(import_v47.z.any());
        } else if (arraySchema.prefixItems) {
            types.array = types.array || import_v47.z.array(import_v47.z.any());
        }
    }
};
// src/handlers/primitive/tuple.ts
var import_v48 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/index.cjs [instrumentation] (ecmascript)");
var TupleHandler = class {
    apply(types, schema) {
        if (schema.type !== "array") return;
        const arraySchema = schema;
        if (!Array.isArray(arraySchema.items)) return;
        if (types.array === false) return;
        const itemSchemas = arraySchema.items.map((itemSchema)=>convertJsonSchemaToZod(itemSchema));
        let tuple;
        if (itemSchemas.length === 0) {
            tuple = import_v48.z.tuple([]);
        } else {
            tuple = import_v48.z.tuple(itemSchemas);
        }
        if (arraySchema.minItems !== void 0 && arraySchema.minItems > itemSchemas.length) {
            tuple = false;
        }
        if (arraySchema.maxItems !== void 0 && arraySchema.maxItems < itemSchemas.length) {
            tuple = false;
        }
        types.tuple = tuple;
        types.array = false;
    }
};
// src/handlers/primitive/object.ts
var import_v49 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/index.cjs [instrumentation] (ecmascript)");
var PropertiesHandler = class {
    apply(types, schema) {
        const objectSchema = schema;
        if (types.object === false) return;
        if (objectSchema.properties || objectSchema.required || objectSchema.additionalProperties !== void 0) {
            types.object = types.object || import_v49.z.object({}).passthrough();
        }
    }
};
var ImplicitObjectHandler = class {
    apply(types, schema) {
        const objectSchema = schema;
        if (schema.type === void 0 && (objectSchema.maxProperties !== void 0 || objectSchema.minProperties !== void 0)) {
            if (types.object === void 0) {
                types.object = import_v49.z.object({}).passthrough();
            }
        }
    }
};
var MaxPropertiesHandler = class {
    apply(types, schema) {
        const objectSchema = schema;
        if (objectSchema.maxProperties === void 0) return;
        if (types.object !== false) {
            const baseObject = types.object || import_v49.z.object({}).passthrough();
            types.object = baseObject.refine((obj)=>Object.keys(obj).length <= objectSchema.maxProperties, {
                message: `Object must have at most ${objectSchema.maxProperties} properties`
            });
        }
    }
};
var MinPropertiesHandler = class {
    apply(types, schema) {
        const objectSchema = schema;
        if (objectSchema.minProperties === void 0) return;
        if (types.object !== false) {
            const baseObject = types.object || import_v49.z.object({}).passthrough();
            types.object = baseObject.refine((obj)=>Object.keys(obj).length >= objectSchema.minProperties, {
                message: `Object must have at least ${objectSchema.minProperties} properties`
            });
        }
    }
};
// src/core/utils.ts
function deepEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return a === b;
    if (typeof a !== typeof b) return false;
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        return a.every((item, index)=>deepEqual(item, b[index]));
    }
    if (typeof a === "object" && typeof b === "object") {
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;
        return keysA.every((key)=>keysB.includes(key) && deepEqual(a[key], b[key]));
    }
    return false;
}
function createUniqueItemsValidator() {
    return (value)=>{
        if (!Array.isArray(value)) {
            return true;
        }
        const seen = [];
        return value.every((item)=>{
            const isDuplicate = seen.some((seenItem)=>deepEqual(item, seenItem));
            if (isDuplicate) {
                return false;
            }
            seen.push(item);
            return true;
        });
    };
}
function isValidWithSchema(schema, value) {
    return schema.safeParse(value).success;
}
// src/handlers/refinement/not.ts
var NotHandler = class {
    apply(zodSchema, schema) {
        if (!schema.not) return zodSchema;
        const notSchema = convertJsonSchemaToZod(schema.not);
        return zodSchema.refine((value)=>!isValidWithSchema(notSchema, value), {
            message: "Value must not match the 'not' schema"
        });
    }
};
// src/handlers/refinement/uniqueItems.ts
var UniqueItemsHandler = class {
    apply(zodSchema, schema) {
        const arraySchema = schema;
        if (arraySchema.uniqueItems !== true) return zodSchema;
        return zodSchema.refine(createUniqueItemsValidator(), {
            message: "Array items must be unique"
        });
    }
};
// src/handlers/refinement/allOf.ts
var import_v410 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/index.cjs [instrumentation] (ecmascript)");
var AllOfHandler = class {
    apply(zodSchema, schema) {
        if (!schema.allOf || schema.allOf.length === 0) return zodSchema;
        const allOfSchemas = schema.allOf.map((s)=>convertJsonSchemaToZod(s));
        return allOfSchemas.reduce((acc, s)=>import_v410.z.intersection(acc, s), zodSchema);
    }
};
// src/handlers/refinement/anyOf.ts
var import_v411 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/index.cjs [instrumentation] (ecmascript)");
var AnyOfHandler = class {
    apply(zodSchema, schema) {
        if (!schema.anyOf || schema.anyOf.length === 0) return zodSchema;
        const anyOfSchema = schema.anyOf.length === 1 ? convertJsonSchemaToZod(schema.anyOf[0]) : import_v411.z.union([
            convertJsonSchemaToZod(schema.anyOf[0]),
            convertJsonSchemaToZod(schema.anyOf[1]),
            ...schema.anyOf.slice(2).map((s)=>convertJsonSchemaToZod(s))
        ]);
        return import_v411.z.intersection(zodSchema, anyOfSchema);
    }
};
// src/handlers/refinement/oneOf.ts
var OneOfHandler = class {
    apply(zodSchema, schema) {
        if (!schema.oneOf || schema.oneOf.length === 0) return zodSchema;
        const oneOfSchemas = schema.oneOf.map((s)=>convertJsonSchemaToZod(s));
        return zodSchema.refine((value)=>{
            let validCount = 0;
            for (const oneOfSchema of oneOfSchemas){
                const result = oneOfSchema.safeParse(value);
                if (result.success) {
                    validCount++;
                    if (validCount > 1) return false;
                }
            }
            return validCount === 1;
        }, {
            message: "Value must match exactly one of the oneOf schemas"
        });
    }
};
// src/handlers/refinement/arrayItems.ts
var PrefixItemsHandler = class {
    apply(zodSchema, schema) {
        const arraySchema = schema;
        if (arraySchema.prefixItems && Array.isArray(arraySchema.prefixItems)) {
            const prefixItems = arraySchema.prefixItems;
            const prefixSchemas = prefixItems.map((itemSchema)=>convertJsonSchemaToZod(itemSchema));
            return zodSchema.refine((value)=>{
                if (!Array.isArray(value)) return true;
                for(let i = 0; i < Math.min(value.length, prefixSchemas.length); i++){
                    if (!isValidWithSchema(prefixSchemas[i], value[i])) {
                        return false;
                    }
                }
                if (value.length > prefixSchemas.length) {
                    if (typeof arraySchema.items === "boolean" && arraySchema.items === false) {
                        return false;
                    } else if (arraySchema.items && typeof arraySchema.items === "object" && !Array.isArray(arraySchema.items)) {
                        const additionalItemSchema = convertJsonSchemaToZod(arraySchema.items);
                        for(let i = prefixSchemas.length; i < value.length; i++){
                            if (!isValidWithSchema(additionalItemSchema, value[i])) {
                                return false;
                            }
                        }
                    }
                }
                return true;
            }, {
                message: "Array does not match prefixItems schema"
            });
        }
        return zodSchema;
    }
};
// src/handlers/refinement/objectProperties.ts
var import_v412 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/index.cjs [instrumentation] (ecmascript)");
var ObjectPropertiesHandler = class {
    apply(zodSchema, schema) {
        const objectSchema = schema;
        if (!objectSchema.properties && !objectSchema.required && objectSchema.additionalProperties !== false) {
            return zodSchema;
        }
        if (zodSchema instanceof import_v412.z.ZodObject || zodSchema instanceof import_v412.z.ZodRecord) {
            const shape = {};
            if (objectSchema.properties) {
                for (const [key, propSchema] of Object.entries(objectSchema.properties)){
                    if (propSchema !== void 0) {
                        shape[key] = convertJsonSchemaToZod(propSchema);
                    }
                }
            }
            if (objectSchema.required && Array.isArray(objectSchema.required)) {
                const required = new Set(objectSchema.required);
                for (const key of Object.keys(shape)){
                    if (!required.has(key)) {
                        shape[key] = shape[key].optional();
                    }
                }
            } else {
                for (const key of Object.keys(shape)){
                    shape[key] = shape[key].optional();
                }
            }
            if (objectSchema.additionalProperties === false) {
                return import_v412.z.object(shape);
            } else {
                return import_v412.z.object(shape).passthrough();
            }
        }
        return zodSchema.refine((value)=>{
            if (typeof value !== "object" || value === null || Array.isArray(value)) {
                return true;
            }
            if (objectSchema.properties) {
                for (const [propName, propSchema] of Object.entries(objectSchema.properties)){
                    if (propSchema !== void 0) {
                        const propExists = Object.getOwnPropertyDescriptor(value, propName) !== void 0;
                        if (propExists) {
                            const zodPropSchema = convertJsonSchemaToZod(propSchema);
                            const propResult = zodPropSchema.safeParse(value[propName]);
                            if (!propResult.success) {
                                return false;
                            }
                        }
                    }
                }
            }
            if (objectSchema.required && Array.isArray(objectSchema.required)) {
                for (const requiredProp of objectSchema.required){
                    const propExists = Object.getOwnPropertyDescriptor(value, requiredProp) !== void 0;
                    if (!propExists) {
                        return false;
                    }
                }
            }
            if (objectSchema.additionalProperties === false && objectSchema.properties) {
                const allowedProps = new Set(Object.keys(objectSchema.properties));
                for(const prop in value){
                    if (!allowedProps.has(prop)) {
                        return false;
                    }
                }
            }
            return true;
        }, {
            message: "Object constraints validation failed"
        });
    }
};
// src/handlers/refinement/enumComplex.ts
var EnumComplexHandler = class {
    apply(zodSchema, schema) {
        if (!schema.enum || schema.enum.length === 0) return zodSchema;
        const complexValues = schema.enum.filter((v)=>Array.isArray(v) || typeof v === "object" && v !== null);
        if (complexValues.length === 0) return zodSchema;
        return zodSchema.refine((value)=>{
            if (typeof value !== "object" || value === null) return true;
            return complexValues.some((enumValue)=>deepEqual(value, enumValue));
        }, {
            message: "Value must match one of the enum values"
        });
    }
};
// src/handlers/refinement/constComplex.ts
var ConstComplexHandler = class {
    apply(zodSchema, schema) {
        if (schema.const === void 0) return zodSchema;
        const constValue = schema.const;
        if (typeof constValue !== "object" || constValue === null) {
            return zodSchema;
        }
        return zodSchema.refine((value)=>deepEqual(value, constValue), {
            message: "Value must equal the const value"
        });
    }
};
// src/handlers/refinement/metadata.ts
var MetadataHandler = class {
    apply(zodSchema, schema) {
        if (schema.description) {
            zodSchema = zodSchema.describe(schema.description);
        }
        return zodSchema;
    }
};
// src/handlers/refinement/protoRequired.ts
var import_v413 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/index.cjs [instrumentation] (ecmascript)");
var ProtoRequiredHandler = class {
    apply(zodSchema, schema) {
        var _a;
        const objectSchema = schema;
        if (!((_a = objectSchema.required) == null ? void 0 : _a.includes("__proto__")) || schema.type !== void 0) {
            return zodSchema;
        }
        return import_v413.z.any().refine((value)=>this.validateRequired(value, objectSchema.required), {
            message: "Missing required properties"
        });
    }
    validateRequired(value, required) {
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
            return true;
        }
        return required.every((prop)=>Object.prototype.hasOwnProperty.call(value, prop));
    }
};
// src/handlers/refinement/contains.ts
var ContainsHandler = class {
    apply(zodSchema, schema) {
        var _a;
        const arraySchema = schema;
        if (arraySchema.contains === void 0) return zodSchema;
        const containsSchema = convertJsonSchemaToZod(arraySchema.contains);
        const minContains = (_a = arraySchema.minContains) != null ? _a : 1;
        const maxContains = arraySchema.maxContains;
        return zodSchema.refine((value)=>{
            if (!Array.isArray(value)) {
                return true;
            }
            let matchCount = 0;
            for (const item of value){
                if (isValidWithSchema(containsSchema, item)) {
                    matchCount++;
                }
            }
            if (matchCount < minContains) {
                return false;
            }
            if (maxContains !== void 0 && matchCount > maxContains) {
                return false;
            }
            return true;
        }, {
            message: "Array must contain required items matching the schema"
        });
    }
};
// src/handlers/refinement/default.ts
var DefaultHandler = class {
    apply(zodSchema, schema) {
        const { default: v } = schema;
        if (v === void 0) return zodSchema;
        if (!zodSchema.safeParse(v).success) {
            return zodSchema;
        }
        return zodSchema.default(v);
    }
};
// src/core/converter.ts
var primitiveHandlers = [
    // Type constraints - should run first
    new ConstHandler(),
    new EnumHandler(),
    new TypeHandler(),
    // File schema detection - must run before string constraints
    new FileHandler(),
    // Implicit type detection - must run before other constraints
    new ImplicitStringHandler(),
    new ImplicitArrayHandler(),
    new ImplicitObjectHandler(),
    // String constraints
    new MinLengthHandler(),
    new MaxLengthHandler(),
    new PatternHandler(),
    // Number constraints
    new MinimumHandler(),
    new MaximumHandler(),
    new ExclusiveMinimumHandler(),
    new ExclusiveMaximumHandler(),
    new MultipleOfHandler(),
    // Array constraints - TupleHandler must run before ItemsHandler
    new TupleHandler(),
    new MinItemsHandler(),
    new MaxItemsHandler(),
    new ItemsHandler(),
    // Object constraints
    new MaxPropertiesHandler(),
    new MinPropertiesHandler(),
    new PropertiesHandler()
];
var refinementHandlers = [
    // Handle special cases first
    new ProtoRequiredHandler(),
    new EnumComplexHandler(),
    new ConstComplexHandler(),
    // Logical combinations
    new AllOfHandler(),
    new AnyOfHandler(),
    new OneOfHandler(),
    // Type-specific refinements
    new PrefixItemsHandler(),
    new ObjectPropertiesHandler(),
    // Array refinements
    new ContainsHandler(),
    // Other refinements
    new NotHandler(),
    new UniqueItemsHandler(),
    new DefaultHandler(),
    // Metadata last
    new MetadataHandler()
];
function convertJsonSchemaToZod(schema) {
    if (typeof schema === "boolean") {
        return schema ? import_v414.z.any() : import_v414.z.never();
    }
    const types = {};
    for (const handler of primitiveHandlers){
        handler.apply(types, schema);
    }
    const allowedSchemas = [];
    if (types.string !== false) {
        allowedSchemas.push(types.string || import_v414.z.string());
    }
    if (types.number !== false) {
        allowedSchemas.push(types.number || import_v414.z.number());
    }
    if (types.boolean !== false) {
        allowedSchemas.push(types.boolean || import_v414.z.boolean());
    }
    if (types.null !== false) {
        allowedSchemas.push(types.null || import_v414.z.null());
    }
    if (types.array !== false) {
        allowedSchemas.push(types.array || import_v414.z.array(import_v414.z.any()));
    }
    if (types.tuple !== false && types.tuple !== void 0) {
        allowedSchemas.push(types.tuple);
    }
    if (types.object !== false) {
        if (types.object) {
            allowedSchemas.push(types.object);
        } else {
            const objectSchema = import_v414.z.custom((val)=>{
                return typeof val === "object" && val !== null && !Array.isArray(val);
            }, "Must be an object, not an array");
            allowedSchemas.push(objectSchema);
        }
    }
    if (types.file !== false && types.file !== void 0) {
        allowedSchemas.push(types.file);
    }
    let zodSchema;
    if (allowedSchemas.length === 0) {
        zodSchema = import_v414.z.never();
    } else if (allowedSchemas.length === 1) {
        zodSchema = allowedSchemas[0];
    } else {
        const hasConstraints = Object.keys(schema).some((key)=>key !== "$schema" && key !== "title" && key !== "description");
        if (!hasConstraints) {
            zodSchema = import_v414.z.any();
        } else {
            zodSchema = import_v414.z.union(allowedSchemas);
        }
    }
    for (const handler of refinementHandlers){
        zodSchema = handler.apply(zodSchema, schema);
    }
    return zodSchema;
}
// src/index.ts
function jsonSchemaObjectToZodRawShape(schema) {
    var _a;
    const raw = {};
    const requiredArray = Array.isArray(schema.required) ? schema.required : [];
    const requiredFields = new Set(requiredArray);
    for (const [key, value] of Object.entries((_a = schema.properties) != null ? _a : {})){
        if (value === void 0) continue;
        let zodType = convertJsonSchemaToZod(value);
        if (requiredArray.length > 0) {
            if (!requiredFields.has(key)) {
                zodType = zodType.optional();
            }
        } else {
            zodType = zodType.optional();
        }
        raw[key] = zodType;
    }
    return raw;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
    convertJsonSchemaToZod,
    createUniqueItemsValidator,
    isValidWithSchema,
    jsonSchemaObjectToZodRawShape
});
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod-from-json-schema@0.0.5/node_modules/zod-from-json-schema/dist/index.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all)=>{
    for(var name in all)__defProp(target, name, {
        get: all[name],
        enumerable: true
    });
};
var __copyProps = (to, from, except, desc)=>{
    if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames(from))if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
            get: ()=>from[key],
            enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
    }
    return to;
};
var __toCommonJS = (mod)=>__copyProps(__defProp({}, "__esModule", {
        value: true
    }), mod);
// src/index.ts
var index_exports = {};
__export(index_exports, {
    convertJsonSchemaToZod: ()=>convertJsonSchemaToZod,
    jsonSchemaObjectToZodRawShape: ()=>jsonSchemaObjectToZodRawShape
});
module.exports = __toCommonJS(index_exports);
var import_zod = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod@3.25.76/node_modules/zod/index.cjs [instrumentation] (ecmascript)");
function convertJsonSchemaToZod(schema) {
    function addMetadata(zodSchema, jsonSchema) {
        if (jsonSchema.description) {
            zodSchema = zodSchema.describe(jsonSchema.description);
        }
        return zodSchema;
    }
    if (schema.const !== void 0) {
        if (typeof schema.const === "string") {
            return addMetadata(import_zod.z.literal(schema.const), schema);
        } else if (typeof schema.const === "number") {
            return addMetadata(import_zod.z.literal(schema.const), schema);
        } else if (typeof schema.const === "boolean") {
            return addMetadata(import_zod.z.literal(schema.const), schema);
        } else if (schema.const === null) {
            return addMetadata(import_zod.z.null(), schema);
        }
        return addMetadata(import_zod.z.literal(schema.const), schema);
    }
    if (schema.type) {
        switch(schema.type){
            case "string":
                {
                    if (schema.enum) {
                        if (schema.enum.length === 0) {
                            return addMetadata(import_zod.z.string(), schema);
                        }
                        return addMetadata(import_zod.z.enum(schema.enum), schema);
                    }
                    let stringSchema = import_zod.z.string();
                    if (schema.minLength !== void 0) {
                        stringSchema = stringSchema.min(schema.minLength);
                    }
                    if (schema.maxLength !== void 0) {
                        stringSchema = stringSchema.max(schema.maxLength);
                    }
                    if (schema.pattern !== void 0) {
                        const regex = new RegExp(schema.pattern);
                        stringSchema = stringSchema.regex(regex);
                    }
                    return addMetadata(stringSchema, schema);
                }
            case "number":
            case "integer":
                {
                    if (schema.enum) {
                        if (schema.enum.length === 0) {
                            return addMetadata(import_zod.z.number(), schema);
                        }
                        const options = schema.enum.map((val)=>import_zod.z.literal(val));
                        if (options.length === 1) {
                            return addMetadata(options[0], schema);
                        }
                        if (options.length >= 2) {
                            const unionSchema = import_zod.z.union([
                                options[0],
                                options[1],
                                ...options.slice(2)
                            ]);
                            return addMetadata(unionSchema, schema);
                        }
                    }
                    let numberSchema = schema.type === "integer" ? import_zod.z.number().int() : import_zod.z.number();
                    if (schema.minimum !== void 0) {
                        numberSchema = numberSchema.min(schema.minimum);
                    }
                    if (schema.maximum !== void 0) {
                        numberSchema = numberSchema.max(schema.maximum);
                    }
                    if (schema.exclusiveMinimum !== void 0) {
                        numberSchema = numberSchema.gt(schema.exclusiveMinimum);
                    }
                    if (schema.exclusiveMaximum !== void 0) {
                        numberSchema = numberSchema.lt(schema.exclusiveMaximum);
                    }
                    if (schema.multipleOf !== void 0) {
                        numberSchema = numberSchema.multipleOf(schema.multipleOf);
                    }
                    return addMetadata(numberSchema, schema);
                }
            case "boolean":
                if (schema.enum) {
                    if (schema.enum.length === 0) {
                        return addMetadata(import_zod.z.boolean(), schema);
                    }
                    const options = schema.enum.map((val)=>import_zod.z.literal(val));
                    if (options.length === 1) {
                        return addMetadata(options[0], schema);
                    }
                    if (options.length >= 2) {
                        const unionSchema = import_zod.z.union([
                            options[0],
                            options[1],
                            ...options.slice(2)
                        ]);
                        return addMetadata(unionSchema, schema);
                    }
                }
                return addMetadata(import_zod.z.boolean(), schema);
            case "null":
                return addMetadata(import_zod.z.null(), schema);
            case "object":
                if (schema.properties) {
                    const shape = {};
                    for (const [key, propSchema] of Object.entries(schema.properties)){
                        shape[key] = convertJsonSchemaToZod(propSchema);
                    }
                    if (schema.required && Array.isArray(schema.required)) {
                        const required = new Set(schema.required);
                        for (const key of Object.keys(shape)){
                            if (!required.has(key)) {
                                shape[key] = shape[key].optional();
                            }
                        }
                    } else {
                        for (const key of Object.keys(shape)){
                            shape[key] = shape[key].optional();
                        }
                    }
                    let zodSchema;
                    if (schema.additionalProperties !== false) {
                        zodSchema = import_zod.z.object(shape).passthrough();
                    } else {
                        zodSchema = import_zod.z.object(shape);
                    }
                    return addMetadata(zodSchema, schema);
                }
                return addMetadata(import_zod.z.object({}), schema);
            case "array":
                {
                    let arraySchema;
                    if (schema.items) {
                        arraySchema = import_zod.z.array(convertJsonSchemaToZod(schema.items));
                    } else {
                        arraySchema = import_zod.z.array(import_zod.z.any());
                    }
                    if (schema.minItems !== void 0) {
                        arraySchema = arraySchema.min(schema.minItems);
                    }
                    if (schema.maxItems !== void 0) {
                        arraySchema = arraySchema.max(schema.maxItems);
                    }
                    if (schema.uniqueItems === true) {
                        arraySchema = arraySchema.refine((items)=>{
                            const seen = /* @__PURE__ */ new Set();
                            return items.every((item)=>{
                                if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
                                    if (seen.has(item)) return false;
                                    seen.add(item);
                                    return true;
                                }
                                const serialized = JSON.stringify(item);
                                if (seen.has(serialized)) return false;
                                seen.add(serialized);
                                return true;
                            });
                        }, {
                            message: "Array items must be unique"
                        });
                    }
                    return addMetadata(arraySchema, schema);
                }
        }
    }
    if (schema.enum) {
        if (schema.enum.length === 0) {
            return addMetadata(import_zod.z.never(), schema);
        }
        const allStrings = schema.enum.every((val)=>typeof val === "string");
        if (allStrings) {
            return addMetadata(import_zod.z.enum(schema.enum), schema);
        } else {
            const options = schema.enum.map((val)=>import_zod.z.literal(val));
            if (options.length === 1) {
                return addMetadata(options[0], schema);
            }
            if (options.length >= 2) {
                const unionSchema = import_zod.z.union([
                    options[0],
                    options[1],
                    ...options.slice(2)
                ]);
                return addMetadata(unionSchema, schema);
            }
        }
    }
    if (schema.anyOf && schema.anyOf.length >= 2) {
        const schemas = schema.anyOf.map(convertJsonSchemaToZod);
        return addMetadata(import_zod.z.union([
            schemas[0],
            schemas[1],
            ...schemas.slice(2)
        ]), schema);
    }
    if (schema.allOf) {
        return addMetadata(schema.allOf.reduce((acc, s)=>import_zod.z.intersection(acc, convertJsonSchemaToZod(s)), import_zod.z.object({})), schema);
    }
    if (schema.oneOf && schema.oneOf.length >= 2) {
        const schemas = schema.oneOf.map(convertJsonSchemaToZod);
        return addMetadata(import_zod.z.union([
            schemas[0],
            schemas[1],
            ...schemas.slice(2)
        ]), schema);
    }
    return addMetadata(import_zod.z.any(), schema);
}
function jsonSchemaObjectToZodRawShape(schema) {
    var _a;
    let raw = {};
    for (const [key, value] of Object.entries((_a = schema.properties) != null ? _a : {})){
        raw[key] = convertJsonSchemaToZod(value);
    }
    return raw;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
    convertJsonSchemaToZod,
    jsonSchemaObjectToZodRawShape
});
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@lukeed+uuid@2.0.1/node_modules/@lukeed/uuid/dist/index.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {

var IDX = 256, HEX = [], BUFFER;
while(IDX--)HEX[IDX] = (IDX + 256).toString(16).substring(1);
function v4() {
    var i = 0, num, out = '';
    if (!BUFFER || IDX + 16 > 256) {
        BUFFER = Array(i = 256);
        while(i--)BUFFER[i] = 256 * Math.random() | 0;
        i = IDX = 0;
    }
    for(; i < 16; i++){
        num = BUFFER[IDX + i];
        if (i == 6) out += HEX[num & 15 | 64];
        else if (i == 8) out += HEX[num & 63 | 128];
        else out += HEX[num];
        if (i & 1 && i > 1 && i < 11) out += '-';
    }
    IDX++;
    return out;
}
exports.v4 = v4;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@standard-schema+spec@1.1.0/node_modules/@standard-schema/spec/dist/index.cjs [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc)=>{
    if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames(from))if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
            get: ()=>from[key],
            enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
    }
    return to;
};
var __toCommonJS = (mod)=>__copyProps(__defProp({}, "__esModule", {
        value: true
    }), mod);
// src/index.ts
var src_exports = {};
module.exports = __toCommonJS(src_exports);
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/eventsource-parser@3.0.8/node_modules/eventsource-parser/dist/index.cjs [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: !0
});
class ParseError extends Error {
    constructor(message, options){
        super(message), this.name = "ParseError", this.type = options.type, this.field = options.field, this.value = options.value, this.line = options.line;
    }
}
const LF = 10, CR = 13, SPACE = 32;
function noop(_arg) {}
function createParser(callbacks) {
    if (typeof callbacks == "function") throw new TypeError("`callbacks` must be an object, got a function instead. Did you mean `{onEvent: fn}`?");
    const { onEvent = noop, onError = noop, onRetry = noop, onComment } = callbacks, pendingFragments = [];
    let isFirstChunk = !0, id, data = "", dataLines = 0, eventType;
    function feed(chunk) {
        if (isFirstChunk && (isFirstChunk = !1, chunk.charCodeAt(0) === 239 && chunk.charCodeAt(1) === 187 && chunk.charCodeAt(2) === 191 && (chunk = chunk.slice(3))), pendingFragments.length === 0) {
            const trailing2 = processLines(chunk);
            trailing2 !== "" && pendingFragments.push(trailing2);
            return;
        }
        if (chunk.indexOf(`
`) === -1 && chunk.indexOf("\r") === -1) {
            pendingFragments.push(chunk);
            return;
        }
        pendingFragments.push(chunk);
        const input = pendingFragments.join("");
        pendingFragments.length = 0;
        const trailing = processLines(input);
        trailing !== "" && pendingFragments.push(trailing);
    }
    function processLines(chunk) {
        let searchIndex = 0;
        if (chunk.indexOf("\r") === -1) {
            let lfIndex = chunk.indexOf(`
`, searchIndex);
            for(; lfIndex !== -1;){
                if (searchIndex === lfIndex) {
                    dataLines > 0 && onEvent({
                        id,
                        event: eventType,
                        data
                    }), id = void 0, data = "", dataLines = 0, eventType = void 0, searchIndex = lfIndex + 1, lfIndex = chunk.indexOf(`
`, searchIndex);
                    continue;
                }
                const firstCharCode = chunk.charCodeAt(searchIndex);
                if (isDataPrefix(chunk, searchIndex, firstCharCode)) {
                    const valueStart = chunk.charCodeAt(searchIndex + 5) === SPACE ? searchIndex + 6 : searchIndex + 5, value = chunk.slice(valueStart, lfIndex);
                    if (dataLines === 0 && chunk.charCodeAt(lfIndex + 1) === LF) {
                        onEvent({
                            id,
                            event: eventType,
                            data: value
                        }), id = void 0, data = "", eventType = void 0, searchIndex = lfIndex + 2, lfIndex = chunk.indexOf(`
`, searchIndex);
                        continue;
                    }
                    data = dataLines === 0 ? value : `${data}
${value}`, dataLines++;
                } else isEventPrefix(chunk, searchIndex, firstCharCode) ? eventType = chunk.slice(chunk.charCodeAt(searchIndex + 6) === SPACE ? searchIndex + 7 : searchIndex + 6, lfIndex) || void 0 : parseLine(chunk, searchIndex, lfIndex);
                searchIndex = lfIndex + 1, lfIndex = chunk.indexOf(`
`, searchIndex);
            }
            return chunk.slice(searchIndex);
        }
        for(; searchIndex < chunk.length;){
            const crIndex = chunk.indexOf("\r", searchIndex), lfIndex = chunk.indexOf(`
`, searchIndex);
            let lineEnd = -1;
            if (crIndex !== -1 && lfIndex !== -1 ? lineEnd = crIndex < lfIndex ? crIndex : lfIndex : crIndex !== -1 ? crIndex === chunk.length - 1 ? lineEnd = -1 : lineEnd = crIndex : lfIndex !== -1 && (lineEnd = lfIndex), lineEnd === -1) break;
            parseLine(chunk, searchIndex, lineEnd), searchIndex = lineEnd + 1, chunk.charCodeAt(searchIndex - 1) === CR && chunk.charCodeAt(searchIndex) === LF && searchIndex++;
        }
        return chunk.slice(searchIndex);
    }
    function parseLine(chunk, start, end) {
        if (start === end) {
            dispatchEvent();
            return;
        }
        const firstCharCode = chunk.charCodeAt(start);
        if (isDataPrefix(chunk, start, firstCharCode)) {
            const valueStart = chunk.charCodeAt(start + 5) === SPACE ? start + 6 : start + 5, value2 = chunk.slice(valueStart, end);
            data = dataLines === 0 ? value2 : `${data}
${value2}`, dataLines++;
            return;
        }
        if (isEventPrefix(chunk, start, firstCharCode)) {
            eventType = chunk.slice(chunk.charCodeAt(start + 6) === SPACE ? start + 7 : start + 6, end) || void 0;
            return;
        }
        if (firstCharCode === 105 && chunk.charCodeAt(start + 1) === 100 && chunk.charCodeAt(start + 2) === 58) {
            const value2 = chunk.slice(chunk.charCodeAt(start + 3) === SPACE ? start + 4 : start + 3, end);
            id = value2.includes("\0") ? void 0 : value2;
            return;
        }
        if (firstCharCode === 58) {
            if (onComment) {
                const line2 = chunk.slice(start, end);
                onComment(line2.slice(chunk.charCodeAt(start + 1) === SPACE ? 2 : 1));
            }
            return;
        }
        const line = chunk.slice(start, end), fieldSeparatorIndex = line.indexOf(":");
        if (fieldSeparatorIndex === -1) {
            processField(line, "", line);
            return;
        }
        const field = line.slice(0, fieldSeparatorIndex), offset = line.charCodeAt(fieldSeparatorIndex + 1) === SPACE ? 2 : 1, value = line.slice(fieldSeparatorIndex + offset);
        processField(field, value, line);
    }
    function processField(field, value, line) {
        switch(field){
            case "event":
                eventType = value || void 0;
                break;
            case "data":
                data = dataLines === 0 ? value : `${data}
${value}`, dataLines++;
                break;
            case "id":
                id = value.includes("\0") ? void 0 : value;
                break;
            case "retry":
                /^\d+$/.test(value) ? onRetry(parseInt(value, 10)) : onError(new ParseError(`Invalid \`retry\` value: "${value}"`, {
                    type: "invalid-retry",
                    value,
                    line
                }));
                break;
            default:
                onError(new ParseError(`Unknown field "${field.length > 20 ? `${field.slice(0, 20)}\u2026` : field}"`, {
                    type: "unknown-field",
                    field,
                    value,
                    line
                }));
                break;
        }
    }
    function dispatchEvent() {
        dataLines > 0 && onEvent({
            id,
            event: eventType,
            data
        }), id = void 0, data = "", dataLines = 0, eventType = void 0;
    }
    function reset(options = {}) {
        if (options.consume && pendingFragments.length > 0) {
            const incompleteLine = pendingFragments.join("");
            parseLine(incompleteLine, 0, incompleteLine.length);
        }
        isFirstChunk = !0, id = void 0, data = "", dataLines = 0, eventType = void 0, pendingFragments.length = 0;
    }
    return {
        feed,
        reset
    };
}
function isDataPrefix(chunk, i, firstCharCode) {
    return firstCharCode === 100 && chunk.charCodeAt(i + 1) === 97 && chunk.charCodeAt(i + 2) === 116 && chunk.charCodeAt(i + 3) === 97 && chunk.charCodeAt(i + 4) === 58;
}
function isEventPrefix(chunk, i, firstCharCode) {
    return firstCharCode === 101 && chunk.charCodeAt(i + 1) === 118 && chunk.charCodeAt(i + 2) === 101 && chunk.charCodeAt(i + 3) === 110 && chunk.charCodeAt(i + 4) === 116 && chunk.charCodeAt(i + 5) === 58;
}
exports.ParseError = ParseError;
exports.createParser = createParser; //# sourceMappingURL=index.cjs.map
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/eventsource-parser@3.0.8/node_modules/eventsource-parser/dist/stream.cjs [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: !0
});
var index = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/eventsource-parser@3.0.8/node_modules/eventsource-parser/dist/index.cjs [instrumentation] (ecmascript)");
class EventSourceParserStream extends TransformStream {
    constructor({ onError, onRetry, onComment } = {}){
        let parser;
        super({
            start (controller) {
                parser = index.createParser({
                    onEvent: (event)=>{
                        controller.enqueue(event);
                    },
                    onError (error) {
                        onError === "terminate" ? controller.error(error) : typeof onError == "function" && onError(error);
                    },
                    onRetry,
                    onComment
                });
            },
            transform (chunk) {
                parser.feed(chunk);
            }
        });
    }
}
exports.ParseError = index.ParseError;
exports.EventSourceParserStream = EventSourceParserStream; //# sourceMappingURL=stream.cjs.map
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@ai-sdk+provider@2.0.3/node_modules/@ai-sdk/provider/dist/index.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all)=>{
    for(var name14 in all)__defProp(target, name14, {
        get: all[name14],
        enumerable: true
    });
};
var __copyProps = (to, from, except, desc)=>{
    if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames(from))if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
            get: ()=>from[key],
            enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
    }
    return to;
};
var __toCommonJS = (mod)=>__copyProps(__defProp({}, "__esModule", {
        value: true
    }), mod);
// src/index.ts
var index_exports = {};
__export(index_exports, {
    AISDKError: ()=>AISDKError,
    APICallError: ()=>APICallError,
    EmptyResponseBodyError: ()=>EmptyResponseBodyError,
    InvalidArgumentError: ()=>InvalidArgumentError,
    InvalidPromptError: ()=>InvalidPromptError,
    InvalidResponseDataError: ()=>InvalidResponseDataError,
    JSONParseError: ()=>JSONParseError,
    LoadAPIKeyError: ()=>LoadAPIKeyError,
    LoadSettingError: ()=>LoadSettingError,
    NoContentGeneratedError: ()=>NoContentGeneratedError,
    NoSuchModelError: ()=>NoSuchModelError,
    TooManyEmbeddingValuesForCallError: ()=>TooManyEmbeddingValuesForCallError,
    TypeValidationError: ()=>TypeValidationError,
    UnsupportedFunctionalityError: ()=>UnsupportedFunctionalityError,
    getErrorMessage: ()=>getErrorMessage,
    isJSONArray: ()=>isJSONArray,
    isJSONObject: ()=>isJSONObject,
    isJSONValue: ()=>isJSONValue
});
module.exports = __toCommonJS(index_exports);
// src/errors/ai-sdk-error.ts
var marker = "vercel.ai.error";
var symbol = Symbol.for(marker);
var _a, _b;
var AISDKError = class _AISDKError extends (_b = Error, _a = symbol, _b) {
    /**
   * Creates an AI SDK Error.
   *
   * @param {Object} params - The parameters for creating the error.
   * @param {string} params.name - The name of the error.
   * @param {string} params.message - The error message.
   * @param {unknown} [params.cause] - The underlying cause of the error.
   */ constructor({ name: name14, message, cause }){
        super(message);
        this[_a] = true;
        this.name = name14;
        this.cause = cause;
    }
    /**
   * Checks if the given error is an AI SDK Error.
   * @param {unknown} error - The error to check.
   * @returns {boolean} True if the error is an AI SDK Error, false otherwise.
   */ static isInstance(error) {
        return _AISDKError.hasMarker(error, marker);
    }
    static hasMarker(error, marker15) {
        const markerSymbol = Symbol.for(marker15);
        return error != null && typeof error === "object" && markerSymbol in error && typeof error[markerSymbol] === "boolean" && error[markerSymbol] === true;
    }
};
// src/errors/api-call-error.ts
var name = "AI_APICallError";
var marker2 = `vercel.ai.error.${name}`;
var symbol2 = Symbol.for(marker2);
var _a2, _b2;
var APICallError = class extends (_b2 = AISDKError, _a2 = symbol2, _b2) {
    constructor({ message, url, requestBodyValues, statusCode, responseHeaders, responseBody, cause, isRetryable = statusCode != null && (statusCode === 408 || // request timeout
    statusCode === 409 || // conflict
    statusCode === 429 || // too many requests
    statusCode >= 500), // server error
    data }){
        super({
            name,
            message,
            cause
        });
        this[_a2] = true;
        this.url = url;
        this.requestBodyValues = requestBodyValues;
        this.statusCode = statusCode;
        this.responseHeaders = responseHeaders;
        this.responseBody = responseBody;
        this.isRetryable = isRetryable;
        this.data = data;
    }
    static isInstance(error) {
        return AISDKError.hasMarker(error, marker2);
    }
};
// src/errors/empty-response-body-error.ts
var name2 = "AI_EmptyResponseBodyError";
var marker3 = `vercel.ai.error.${name2}`;
var symbol3 = Symbol.for(marker3);
var _a3, _b3;
var EmptyResponseBodyError = class extends (_b3 = AISDKError, _a3 = symbol3, _b3) {
    // used in isInstance
    constructor({ message = "Empty response body" } = {}){
        super({
            name: name2,
            message
        });
        this[_a3] = true;
    }
    static isInstance(error) {
        return AISDKError.hasMarker(error, marker3);
    }
};
// src/errors/get-error-message.ts
function getErrorMessage(error) {
    if (error == null) {
        return "unknown error";
    }
    if (typeof error === "string") {
        return error;
    }
    if (error instanceof Error) {
        return error.message;
    }
    return JSON.stringify(error);
}
// src/errors/invalid-argument-error.ts
var name3 = "AI_InvalidArgumentError";
var marker4 = `vercel.ai.error.${name3}`;
var symbol4 = Symbol.for(marker4);
var _a4, _b4;
var InvalidArgumentError = class extends (_b4 = AISDKError, _a4 = symbol4, _b4) {
    constructor({ message, cause, argument }){
        super({
            name: name3,
            message,
            cause
        });
        this[_a4] = true;
        this.argument = argument;
    }
    static isInstance(error) {
        return AISDKError.hasMarker(error, marker4);
    }
};
// src/errors/invalid-prompt-error.ts
var name4 = "AI_InvalidPromptError";
var marker5 = `vercel.ai.error.${name4}`;
var symbol5 = Symbol.for(marker5);
var _a5, _b5;
var InvalidPromptError = class extends (_b5 = AISDKError, _a5 = symbol5, _b5) {
    constructor({ prompt, message, cause }){
        super({
            name: name4,
            message: `Invalid prompt: ${message}`,
            cause
        });
        this[_a5] = true;
        this.prompt = prompt;
    }
    static isInstance(error) {
        return AISDKError.hasMarker(error, marker5);
    }
};
// src/errors/invalid-response-data-error.ts
var name5 = "AI_InvalidResponseDataError";
var marker6 = `vercel.ai.error.${name5}`;
var symbol6 = Symbol.for(marker6);
var _a6, _b6;
var InvalidResponseDataError = class extends (_b6 = AISDKError, _a6 = symbol6, _b6) {
    constructor({ data, message = `Invalid response data: ${JSON.stringify(data)}.` }){
        super({
            name: name5,
            message
        });
        this[_a6] = true;
        this.data = data;
    }
    static isInstance(error) {
        return AISDKError.hasMarker(error, marker6);
    }
};
// src/errors/json-parse-error.ts
var name6 = "AI_JSONParseError";
var marker7 = `vercel.ai.error.${name6}`;
var symbol7 = Symbol.for(marker7);
var _a7, _b7;
var JSONParseError = class extends (_b7 = AISDKError, _a7 = symbol7, _b7) {
    constructor({ text, cause }){
        super({
            name: name6,
            message: `JSON parsing failed: Text: ${text}.
Error message: ${getErrorMessage(cause)}`,
            cause
        });
        this[_a7] = true;
        this.text = text;
    }
    static isInstance(error) {
        return AISDKError.hasMarker(error, marker7);
    }
};
// src/errors/load-api-key-error.ts
var name7 = "AI_LoadAPIKeyError";
var marker8 = `vercel.ai.error.${name7}`;
var symbol8 = Symbol.for(marker8);
var _a8, _b8;
var LoadAPIKeyError = class extends (_b8 = AISDKError, _a8 = symbol8, _b8) {
    // used in isInstance
    constructor({ message }){
        super({
            name: name7,
            message
        });
        this[_a8] = true;
    }
    static isInstance(error) {
        return AISDKError.hasMarker(error, marker8);
    }
};
// src/errors/load-setting-error.ts
var name8 = "AI_LoadSettingError";
var marker9 = `vercel.ai.error.${name8}`;
var symbol9 = Symbol.for(marker9);
var _a9, _b9;
var LoadSettingError = class extends (_b9 = AISDKError, _a9 = symbol9, _b9) {
    // used in isInstance
    constructor({ message }){
        super({
            name: name8,
            message
        });
        this[_a9] = true;
    }
    static isInstance(error) {
        return AISDKError.hasMarker(error, marker9);
    }
};
// src/errors/no-content-generated-error.ts
var name9 = "AI_NoContentGeneratedError";
var marker10 = `vercel.ai.error.${name9}`;
var symbol10 = Symbol.for(marker10);
var _a10, _b10;
var NoContentGeneratedError = class extends (_b10 = AISDKError, _a10 = symbol10, _b10) {
    // used in isInstance
    constructor({ message = "No content generated." } = {}){
        super({
            name: name9,
            message
        });
        this[_a10] = true;
    }
    static isInstance(error) {
        return AISDKError.hasMarker(error, marker10);
    }
};
// src/errors/no-such-model-error.ts
var name10 = "AI_NoSuchModelError";
var marker11 = `vercel.ai.error.${name10}`;
var symbol11 = Symbol.for(marker11);
var _a11, _b11;
var NoSuchModelError = class extends (_b11 = AISDKError, _a11 = symbol11, _b11) {
    constructor({ errorName = name10, modelId, modelType, message = `No such ${modelType}: ${modelId}` }){
        super({
            name: errorName,
            message
        });
        this[_a11] = true;
        this.modelId = modelId;
        this.modelType = modelType;
    }
    static isInstance(error) {
        return AISDKError.hasMarker(error, marker11);
    }
};
// src/errors/too-many-embedding-values-for-call-error.ts
var name11 = "AI_TooManyEmbeddingValuesForCallError";
var marker12 = `vercel.ai.error.${name11}`;
var symbol12 = Symbol.for(marker12);
var _a12, _b12;
var TooManyEmbeddingValuesForCallError = class extends (_b12 = AISDKError, _a12 = symbol12, _b12) {
    constructor(options){
        super({
            name: name11,
            message: `Too many values for a single embedding call. The ${options.provider} model "${options.modelId}" can only embed up to ${options.maxEmbeddingsPerCall} values per call, but ${options.values.length} values were provided.`
        });
        this[_a12] = true;
        this.provider = options.provider;
        this.modelId = options.modelId;
        this.maxEmbeddingsPerCall = options.maxEmbeddingsPerCall;
        this.values = options.values;
    }
    static isInstance(error) {
        return AISDKError.hasMarker(error, marker12);
    }
};
// src/errors/type-validation-error.ts
var name12 = "AI_TypeValidationError";
var marker13 = `vercel.ai.error.${name12}`;
var symbol13 = Symbol.for(marker13);
var _a13, _b13;
var TypeValidationError = class _TypeValidationError extends (_b13 = AISDKError, _a13 = symbol13, _b13) {
    constructor({ value, cause }){
        super({
            name: name12,
            message: `Type validation failed: Value: ${JSON.stringify(value)}.
Error message: ${getErrorMessage(cause)}`,
            cause
        });
        this[_a13] = true;
        this.value = value;
    }
    static isInstance(error) {
        return AISDKError.hasMarker(error, marker13);
    }
    /**
   * Wraps an error into a TypeValidationError.
   * If the cause is already a TypeValidationError with the same value, it returns the cause.
   * Otherwise, it creates a new TypeValidationError.
   *
   * @param {Object} params - The parameters for wrapping the error.
   * @param {unknown} params.value - The value that failed validation.
   * @param {unknown} params.cause - The original error or cause of the validation failure.
   * @returns {TypeValidationError} A TypeValidationError instance.
   */ static wrap({ value, cause }) {
        return _TypeValidationError.isInstance(cause) && cause.value === value ? cause : new _TypeValidationError({
            value,
            cause
        });
    }
};
// src/errors/unsupported-functionality-error.ts
var name13 = "AI_UnsupportedFunctionalityError";
var marker14 = `vercel.ai.error.${name13}`;
var symbol14 = Symbol.for(marker14);
var _a14, _b14;
var UnsupportedFunctionalityError = class extends (_b14 = AISDKError, _a14 = symbol14, _b14) {
    constructor({ functionality, message = `'${functionality}' functionality not supported.` }){
        super({
            name: name13,
            message
        });
        this[_a14] = true;
        this.functionality = functionality;
    }
    static isInstance(error) {
        return AISDKError.hasMarker(error, marker14);
    }
};
// src/json-value/is-json.ts
function isJSONValue(value) {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return true;
    }
    if (Array.isArray(value)) {
        return value.every(isJSONValue);
    }
    if (typeof value === "object") {
        return Object.entries(value).every(([key, val])=>typeof key === "string" && isJSONValue(val));
    }
    return false;
}
function isJSONArray(value) {
    return Array.isArray(value) && value.every(isJSONValue);
}
function isJSONObject(value) {
    return value != null && typeof value === "object" && Object.entries(value).every(([key, val])=>typeof key === "string" && isJSONValue(val));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
    AISDKError,
    APICallError,
    EmptyResponseBodyError,
    InvalidArgumentError,
    InvalidPromptError,
    InvalidResponseDataError,
    JSONParseError,
    LoadAPIKeyError,
    LoadSettingError,
    NoContentGeneratedError,
    NoSuchModelError,
    TooManyEmbeddingValuesForCallError,
    TypeValidationError,
    UnsupportedFunctionalityError,
    getErrorMessage,
    isJSONArray,
    isJSONObject,
    isJSONValue
}); //# sourceMappingURL=index.js.map
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@ai-sdk+provider-utils@3.0.25_zod@3.25.76/node_modules/@ai-sdk/provider-utils/dist/index.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all)=>{
    for(var name2 in all)__defProp(target, name2, {
        get: all[name2],
        enumerable: true
    });
};
var __copyProps = (to, from, except, desc)=>{
    if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames(from))if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
            get: ()=>from[key],
            enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
    }
    return to;
};
var __reExport = (target, mod, secondTarget)=>(__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
var __toESM = (mod, isNodeMode, target)=>(target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(// If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
        value: mod,
        enumerable: true
    }) : target, mod));
var __toCommonJS = (mod)=>__copyProps(__defProp({}, "__esModule", {
        value: true
    }), mod);
// src/index.ts
var index_exports = {};
__export(index_exports, {
    DEFAULT_MAX_DOWNLOAD_SIZE: ()=>DEFAULT_MAX_DOWNLOAD_SIZE,
    DelayedPromise: ()=>DelayedPromise,
    DownloadError: ()=>DownloadError,
    EventSourceParserStream: ()=>import_stream2.EventSourceParserStream,
    VERSION: ()=>VERSION,
    asSchema: ()=>asSchema,
    asValidator: ()=>asValidator,
    combineHeaders: ()=>combineHeaders,
    convertAsyncIteratorToReadableStream: ()=>convertAsyncIteratorToReadableStream,
    convertBase64ToUint8Array: ()=>convertBase64ToUint8Array,
    convertToBase64: ()=>convertToBase64,
    convertUint8ArrayToBase64: ()=>convertUint8ArrayToBase64,
    createBinaryResponseHandler: ()=>createBinaryResponseHandler,
    createEventSourceResponseHandler: ()=>createEventSourceResponseHandler,
    createIdGenerator: ()=>createIdGenerator,
    createJsonErrorResponseHandler: ()=>createJsonErrorResponseHandler,
    createJsonResponseHandler: ()=>createJsonResponseHandler,
    createJsonStreamResponseHandler: ()=>createJsonStreamResponseHandler,
    createProviderDefinedToolFactory: ()=>createProviderDefinedToolFactory,
    createProviderDefinedToolFactoryWithOutputSchema: ()=>createProviderDefinedToolFactoryWithOutputSchema,
    createStatusCodeErrorResponseHandler: ()=>createStatusCodeErrorResponseHandler,
    delay: ()=>delay,
    dynamicTool: ()=>dynamicTool,
    executeTool: ()=>executeTool,
    extractResponseHeaders: ()=>extractResponseHeaders,
    generateId: ()=>generateId,
    getErrorMessage: ()=>getErrorMessage,
    getFromApi: ()=>getFromApi,
    getRuntimeEnvironmentUserAgent: ()=>getRuntimeEnvironmentUserAgent,
    injectJsonInstructionIntoMessages: ()=>injectJsonInstructionIntoMessages,
    isAbortError: ()=>isAbortError,
    isParsableJson: ()=>isParsableJson,
    isUrlSupported: ()=>isUrlSupported,
    isValidator: ()=>isValidator,
    jsonSchema: ()=>jsonSchema,
    lazySchema: ()=>lazySchema,
    lazyValidator: ()=>lazyValidator,
    loadApiKey: ()=>loadApiKey,
    loadOptionalSetting: ()=>loadOptionalSetting,
    loadSetting: ()=>loadSetting,
    mediaTypeToExtension: ()=>mediaTypeToExtension,
    normalizeHeaders: ()=>normalizeHeaders,
    parseJSON: ()=>parseJSON,
    parseJsonEventStream: ()=>parseJsonEventStream,
    parseProviderOptions: ()=>parseProviderOptions,
    postFormDataToApi: ()=>postFormDataToApi,
    postJsonToApi: ()=>postJsonToApi,
    postToApi: ()=>postToApi,
    readResponseWithSizeLimit: ()=>readResponseWithSizeLimit,
    removeUndefinedEntries: ()=>removeUndefinedEntries,
    resolve: ()=>resolve,
    safeParseJSON: ()=>safeParseJSON,
    safeValidateTypes: ()=>safeValidateTypes,
    standardSchemaValidator: ()=>standardSchemaValidator,
    tool: ()=>tool,
    validateDownloadUrl: ()=>validateDownloadUrl,
    validateTypes: ()=>validateTypes,
    validator: ()=>validator,
    withUserAgentSuffix: ()=>withUserAgentSuffix,
    withoutTrailingSlash: ()=>withoutTrailingSlash,
    zodSchema: ()=>zodSchema
});
module.exports = __toCommonJS(index_exports);
// src/combine-headers.ts
function combineHeaders(...headers) {
    return headers.reduce((combinedHeaders, currentHeaders)=>({
            ...combinedHeaders,
            ...currentHeaders != null ? currentHeaders : {}
        }), {});
}
// src/convert-async-iterator-to-readable-stream.ts
function convertAsyncIteratorToReadableStream(iterator) {
    let cancelled = false;
    return new ReadableStream({
        /**
     * Called when the consumer wants to pull more data from the stream.
     *
     * @param {ReadableStreamDefaultController<T>} controller - The controller to enqueue data into the stream.
     * @returns {Promise<void>}
     */ async pull (controller) {
            if (cancelled) return;
            try {
                const { value, done } = await iterator.next();
                if (done) {
                    controller.close();
                } else {
                    controller.enqueue(value);
                }
            } catch (error) {
                controller.error(error);
            }
        },
        /**
     * Called when the consumer cancels the stream.
     */ async cancel (reason) {
            cancelled = true;
            if (iterator.return) {
                try {
                    await iterator.return(reason);
                } catch (e) {}
            }
        }
    });
}
// src/delay.ts
async function delay(delayInMs, options) {
    if (delayInMs == null) {
        return Promise.resolve();
    }
    const signal = options == null ? void 0 : options.abortSignal;
    return new Promise((resolve2, reject)=>{
        if (signal == null ? void 0 : signal.aborted) {
            reject(createAbortError());
            return;
        }
        const timeoutId = setTimeout(()=>{
            cleanup();
            resolve2();
        }, delayInMs);
        const cleanup = ()=>{
            clearTimeout(timeoutId);
            signal == null ? void 0 : signal.removeEventListener("abort", onAbort);
        };
        const onAbort = ()=>{
            cleanup();
            reject(createAbortError());
        };
        signal == null ? void 0 : signal.addEventListener("abort", onAbort);
    });
}
function createAbortError() {
    return new DOMException("Delay was aborted", "AbortError");
}
// src/delayed-promise.ts
var DelayedPromise = class {
    constructor(){
        this.status = {
            type: "pending"
        };
        this._resolve = void 0;
        this._reject = void 0;
    }
    get promise() {
        if (this._promise) {
            return this._promise;
        }
        this._promise = new Promise((resolve2, reject)=>{
            if (this.status.type === "resolved") {
                resolve2(this.status.value);
            } else if (this.status.type === "rejected") {
                reject(this.status.error);
            }
            this._resolve = resolve2;
            this._reject = reject;
        });
        return this._promise;
    }
    resolve(value) {
        var _a2;
        this.status = {
            type: "resolved",
            value
        };
        if (this._promise) {
            (_a2 = this._resolve) == null ? void 0 : _a2.call(this, value);
        }
    }
    reject(error) {
        var _a2;
        this.status = {
            type: "rejected",
            error
        };
        if (this._promise) {
            (_a2 = this._reject) == null ? void 0 : _a2.call(this, error);
        }
    }
    isResolved() {
        return this.status.type === "resolved";
    }
    isRejected() {
        return this.status.type === "rejected";
    }
    isPending() {
        return this.status.type === "pending";
    }
};
// src/extract-response-headers.ts
function extractResponseHeaders(response) {
    return Object.fromEntries([
        ...response.headers
    ]);
}
// src/download-error.ts
var import_provider = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@ai-sdk+provider@2.0.3/node_modules/@ai-sdk/provider/dist/index.js [instrumentation] (ecmascript)");
var name = "AI_DownloadError";
var marker = `vercel.ai.error.${name}`;
var symbol = Symbol.for(marker);
var _a, _b;
var DownloadError = class extends (_b = import_provider.AISDKError, _a = symbol, _b) {
    constructor({ url, statusCode, statusText, cause, message = cause == null ? `Failed to download ${url}: ${statusCode} ${statusText}` : `Failed to download ${url}: ${cause}` }){
        super({
            name,
            message,
            cause
        });
        this[_a] = true;
        this.url = url;
        this.statusCode = statusCode;
        this.statusText = statusText;
    }
    static isInstance(error) {
        return import_provider.AISDKError.hasMarker(error, marker);
    }
};
// src/read-response-with-size-limit.ts
var DEFAULT_MAX_DOWNLOAD_SIZE = 2 * 1024 * 1024 * 1024;
async function readResponseWithSizeLimit({ response, url, maxBytes = DEFAULT_MAX_DOWNLOAD_SIZE }) {
    const contentLength = response.headers.get("content-length");
    if (contentLength != null) {
        const length = parseInt(contentLength, 10);
        if (!isNaN(length) && length > maxBytes) {
            throw new DownloadError({
                url,
                message: `Download of ${url} exceeded maximum size of ${maxBytes} bytes (Content-Length: ${length}).`
            });
        }
    }
    const body = response.body;
    if (body == null) {
        return new Uint8Array(0);
    }
    const reader = body.getReader();
    const chunks = [];
    let totalBytes = 0;
    try {
        while(true){
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            totalBytes += value.length;
            if (totalBytes > maxBytes) {
                throw new DownloadError({
                    url,
                    message: `Download of ${url} exceeded maximum size of ${maxBytes} bytes.`
                });
            }
            chunks.push(value);
        }
    } finally{
        try {
            await reader.cancel();
        } finally{
            reader.releaseLock();
        }
    }
    const result = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks){
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return result;
}
// src/generate-id.ts
var import_provider2 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@ai-sdk+provider@2.0.3/node_modules/@ai-sdk/provider/dist/index.js [instrumentation] (ecmascript)");
var createIdGenerator = ({ prefix, size = 16, alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", separator = "-" } = {})=>{
    const generator = ()=>{
        const alphabetLength = alphabet.length;
        const chars = new Array(size);
        for(let i = 0; i < size; i++){
            chars[i] = alphabet[Math.random() * alphabetLength | 0];
        }
        return chars.join("");
    };
    if (prefix == null) {
        return generator;
    }
    if (alphabet.includes(separator)) {
        throw new import_provider2.InvalidArgumentError({
            argument: "separator",
            message: `The separator "${separator}" must not be part of the alphabet "${alphabet}".`
        });
    }
    return ()=>`${prefix}${separator}${generator()}`;
};
var generateId = createIdGenerator();
// src/get-error-message.ts
function getErrorMessage(error) {
    if (error == null) {
        return "unknown error";
    }
    if (typeof error === "string") {
        return error;
    }
    if (error instanceof Error) {
        return error.message;
    }
    return JSON.stringify(error);
}
// src/get-from-api.ts
var import_provider4 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@ai-sdk+provider@2.0.3/node_modules/@ai-sdk/provider/dist/index.js [instrumentation] (ecmascript)");
// src/handle-fetch-error.ts
var import_provider3 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@ai-sdk+provider@2.0.3/node_modules/@ai-sdk/provider/dist/index.js [instrumentation] (ecmascript)");
// src/is-abort-error.ts
function isAbortError(error) {
    return (error instanceof Error || error instanceof DOMException) && (error.name === "AbortError" || error.name === "ResponseAborted" || // Next.js
    error.name === "TimeoutError");
}
// src/handle-fetch-error.ts
var FETCH_FAILED_ERROR_MESSAGES = [
    "fetch failed",
    "failed to fetch"
];
function handleFetchError({ error, url, requestBodyValues }) {
    if (isAbortError(error)) {
        return error;
    }
    if (error instanceof TypeError && FETCH_FAILED_ERROR_MESSAGES.includes(error.message.toLowerCase())) {
        const cause = error.cause;
        if (cause != null) {
            return new import_provider3.APICallError({
                message: `Cannot connect to API: ${cause.message}`,
                cause,
                url,
                requestBodyValues,
                isRetryable: true
            });
        }
    }
    return error;
}
// src/get-runtime-environment-user-agent.ts
function getRuntimeEnvironmentUserAgent(globalThisAny = globalThis) {
    var _a2, _b2, _c;
    if (globalThisAny.window) {
        return `runtime/browser`;
    }
    if ((_a2 = globalThisAny.navigator) == null ? void 0 : _a2.userAgent) {
        return `runtime/${globalThisAny.navigator.userAgent.toLowerCase()}`;
    }
    if ((_c = (_b2 = globalThisAny.process) == null ? void 0 : _b2.versions) == null ? void 0 : _c.node) {
        return `runtime/node.js/${globalThisAny.process.version.substring(0)}`;
    }
    if (globalThisAny.EdgeRuntime) {
        return `runtime/vercel-edge`;
    }
    return "runtime/unknown";
}
// src/normalize-headers.ts
function normalizeHeaders(headers) {
    if (headers == null) {
        return {};
    }
    const normalized = {};
    if (headers instanceof Headers) {
        headers.forEach((value, key)=>{
            normalized[key.toLowerCase()] = value;
        });
    } else {
        if (!Array.isArray(headers)) {
            headers = Object.entries(headers);
        }
        for (const [key, value] of headers){
            if (value != null) {
                normalized[key.toLowerCase()] = value;
            }
        }
    }
    return normalized;
}
// src/with-user-agent-suffix.ts
function withUserAgentSuffix(headers, ...userAgentSuffixParts) {
    const normalizedHeaders = new Headers(normalizeHeaders(headers));
    const currentUserAgentHeader = normalizedHeaders.get("user-agent") || "";
    normalizedHeaders.set("user-agent", [
        currentUserAgentHeader,
        ...userAgentSuffixParts
    ].filter(Boolean).join(" "));
    return Object.fromEntries(normalizedHeaders.entries());
}
// src/version.ts
var VERSION = ("TURBOPACK compile-time truthy", 1) ? "3.0.25" : "TURBOPACK unreachable";
// src/get-from-api.ts
var getOriginalFetch = ()=>globalThis.fetch;
var getFromApi = async ({ url, headers = {}, successfulResponseHandler, failedResponseHandler, abortSignal, fetch = getOriginalFetch() })=>{
    try {
        const response = await fetch(url, {
            method: "GET",
            headers: withUserAgentSuffix(headers, `ai-sdk/provider-utils/${VERSION}`, getRuntimeEnvironmentUserAgent()),
            signal: abortSignal
        });
        const responseHeaders = extractResponseHeaders(response);
        if (!response.ok) {
            let errorInformation;
            try {
                errorInformation = await failedResponseHandler({
                    response,
                    url,
                    requestBodyValues: {}
                });
            } catch (error) {
                if (isAbortError(error) || import_provider4.APICallError.isInstance(error)) {
                    throw error;
                }
                throw new import_provider4.APICallError({
                    message: "Failed to process error response",
                    cause: error,
                    statusCode: response.status,
                    url,
                    responseHeaders,
                    requestBodyValues: {}
                });
            }
            throw errorInformation.value;
        }
        try {
            return await successfulResponseHandler({
                response,
                url,
                requestBodyValues: {}
            });
        } catch (error) {
            if (error instanceof Error) {
                if (isAbortError(error) || import_provider4.APICallError.isInstance(error)) {
                    throw error;
                }
            }
            throw new import_provider4.APICallError({
                message: "Failed to process successful response",
                cause: error,
                statusCode: response.status,
                url,
                responseHeaders,
                requestBodyValues: {}
            });
        }
    } catch (error) {
        throw handleFetchError({
            error,
            url,
            requestBodyValues: {}
        });
    }
};
// src/inject-json-instruction.ts
var DEFAULT_SCHEMA_PREFIX = "JSON schema:";
var DEFAULT_SCHEMA_SUFFIX = "You MUST answer with a JSON object that matches the JSON schema above.";
var DEFAULT_GENERIC_SUFFIX = "You MUST answer with JSON.";
function injectJsonInstruction({ prompt, schema, schemaPrefix = schema != null ? DEFAULT_SCHEMA_PREFIX : void 0, schemaSuffix = schema != null ? DEFAULT_SCHEMA_SUFFIX : DEFAULT_GENERIC_SUFFIX }) {
    return [
        prompt != null && prompt.length > 0 ? prompt : void 0,
        prompt != null && prompt.length > 0 ? "" : void 0,
        // add a newline if prompt is not null
        schemaPrefix,
        schema != null ? JSON.stringify(schema) : void 0,
        schemaSuffix
    ].filter((line)=>line != null).join("\n");
}
function injectJsonInstructionIntoMessages({ messages, schema, schemaPrefix, schemaSuffix }) {
    var _a2, _b2;
    const systemMessage = ((_a2 = messages[0]) == null ? void 0 : _a2.role) === "system" ? {
        ...messages[0]
    } : {
        role: "system",
        content: ""
    };
    systemMessage.content = injectJsonInstruction({
        prompt: systemMessage.content,
        schema,
        schemaPrefix,
        schemaSuffix
    });
    return [
        systemMessage,
        ...((_b2 = messages[0]) == null ? void 0 : _b2.role) === "system" ? messages.slice(1) : messages
    ];
}
// src/is-url-supported.ts
function isUrlSupported({ mediaType, url, supportedUrls }) {
    url = url.toLowerCase();
    mediaType = mediaType.toLowerCase();
    return Object.entries(supportedUrls).map(([key, value])=>{
        const mediaType2 = key.toLowerCase();
        return mediaType2 === "*" || mediaType2 === "*/*" ? {
            mediaTypePrefix: "",
            regexes: value
        } : {
            mediaTypePrefix: mediaType2.replace(/\*/, ""),
            regexes: value
        };
    }).filter(({ mediaTypePrefix })=>mediaType.startsWith(mediaTypePrefix)).flatMap(({ regexes })=>regexes).some((pattern)=>pattern.test(url));
}
// src/load-api-key.ts
var import_provider5 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@ai-sdk+provider@2.0.3/node_modules/@ai-sdk/provider/dist/index.js [instrumentation] (ecmascript)");
function loadApiKey({ apiKey, environmentVariableName, apiKeyParameterName = "apiKey", description }) {
    if (typeof apiKey === "string") {
        return apiKey;
    }
    if (apiKey != null) {
        throw new import_provider5.LoadAPIKeyError({
            message: `${description} API key must be a string.`
        });
    }
    if (typeof process === "undefined") {
        throw new import_provider5.LoadAPIKeyError({
            message: `${description} API key is missing. Pass it using the '${apiKeyParameterName}' parameter. Environment variables is not supported in this environment.`
        });
    }
    apiKey = process.env[environmentVariableName];
    if (apiKey == null) {
        throw new import_provider5.LoadAPIKeyError({
            message: `${description} API key is missing. Pass it using the '${apiKeyParameterName}' parameter or the ${environmentVariableName} environment variable.`
        });
    }
    if (typeof apiKey !== "string") {
        throw new import_provider5.LoadAPIKeyError({
            message: `${description} API key must be a string. The value of the ${environmentVariableName} environment variable is not a string.`
        });
    }
    return apiKey;
}
// src/load-optional-setting.ts
function loadOptionalSetting({ settingValue, environmentVariableName }) {
    if (typeof settingValue === "string") {
        return settingValue;
    }
    if (settingValue != null || typeof process === "undefined") {
        return void 0;
    }
    settingValue = process.env[environmentVariableName];
    if (settingValue == null || typeof settingValue !== "string") {
        return void 0;
    }
    return settingValue;
}
// src/load-setting.ts
var import_provider6 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@ai-sdk+provider@2.0.3/node_modules/@ai-sdk/provider/dist/index.js [instrumentation] (ecmascript)");
function loadSetting({ settingValue, environmentVariableName, settingName, description }) {
    if (typeof settingValue === "string") {
        return settingValue;
    }
    if (settingValue != null) {
        throw new import_provider6.LoadSettingError({
            message: `${description} setting must be a string.`
        });
    }
    if (typeof process === "undefined") {
        throw new import_provider6.LoadSettingError({
            message: `${description} setting is missing. Pass it using the '${settingName}' parameter. Environment variables is not supported in this environment.`
        });
    }
    settingValue = process.env[environmentVariableName];
    if (settingValue == null) {
        throw new import_provider6.LoadSettingError({
            message: `${description} setting is missing. Pass it using the '${settingName}' parameter or the ${environmentVariableName} environment variable.`
        });
    }
    if (typeof settingValue !== "string") {
        throw new import_provider6.LoadSettingError({
            message: `${description} setting must be a string. The value of the ${environmentVariableName} environment variable is not a string.`
        });
    }
    return settingValue;
}
// src/media-type-to-extension.ts
function mediaTypeToExtension(mediaType) {
    var _a2;
    const [_type, subtype = ""] = mediaType.toLowerCase().split("/");
    return (_a2 = ({
        mpeg: "mp3",
        "x-wav": "wav",
        opus: "ogg",
        mp4: "m4a",
        "x-m4a": "m4a"
    })[subtype]) != null ? _a2 : subtype;
}
// src/parse-json.ts
var import_provider9 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@ai-sdk+provider@2.0.3/node_modules/@ai-sdk/provider/dist/index.js [instrumentation] (ecmascript)");
// src/secure-json-parse.ts
var suspectProtoRx = /"(?:_|\\u005[Ff])(?:_|\\u005[Ff])(?:p|\\u0070)(?:r|\\u0072)(?:o|\\u006[Ff])(?:t|\\u0074)(?:o|\\u006[Ff])(?:_|\\u005[Ff])(?:_|\\u005[Ff])"\s*:/;
var suspectConstructorRx = /"(?:c|\\u0063)(?:o|\\u006[Ff])(?:n|\\u006[Ee])(?:s|\\u0073)(?:t|\\u0074)(?:r|\\u0072)(?:u|\\u0075)(?:c|\\u0063)(?:t|\\u0074)(?:o|\\u006[Ff])(?:r|\\u0072)"\s*:/;
function _parse(text) {
    const obj = JSON.parse(text);
    if (obj === null || typeof obj !== "object") {
        return obj;
    }
    if (suspectProtoRx.test(text) === false && suspectConstructorRx.test(text) === false) {
        return obj;
    }
    return filter(obj);
}
function filter(obj) {
    let next = [
        obj
    ];
    while(next.length){
        const nodes = next;
        next = [];
        for (const node of nodes){
            if (Object.prototype.hasOwnProperty.call(node, "__proto__")) {
                throw new SyntaxError("Object contains forbidden prototype property");
            }
            if (Object.prototype.hasOwnProperty.call(node, "constructor") && node.constructor !== null && typeof node.constructor === "object" && Object.prototype.hasOwnProperty.call(node.constructor, "prototype")) {
                throw new SyntaxError("Object contains forbidden prototype property");
            }
            for(const key in node){
                const value = node[key];
                if (value && typeof value === "object") {
                    next.push(value);
                }
            }
        }
    }
    return obj;
}
function secureJsonParse(text) {
    const { stackTraceLimit } = Error;
    try {
        Error.stackTraceLimit = 0;
    } catch (e) {
        return _parse(text);
    }
    try {
        return _parse(text);
    } finally{
        Error.stackTraceLimit = stackTraceLimit;
    }
}
// src/validate-types.ts
var import_provider8 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@ai-sdk+provider@2.0.3/node_modules/@ai-sdk/provider/dist/index.js [instrumentation] (ecmascript)");
// src/validator.ts
var import_provider7 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@ai-sdk+provider@2.0.3/node_modules/@ai-sdk/provider/dist/index.js [instrumentation] (ecmascript)");
var validatorSymbol = /* @__PURE__ */ Symbol.for("vercel.ai.validator");
function validator(validate) {
    return {
        [validatorSymbol]: true,
        validate
    };
}
function isValidator(value) {
    return typeof value === "object" && value !== null && validatorSymbol in value && value[validatorSymbol] === true && "validate" in value;
}
function lazyValidator(createValidator) {
    let validator2;
    return ()=>{
        if (validator2 == null) {
            validator2 = createValidator();
        }
        return validator2;
    };
}
function asValidator(value) {
    return isValidator(value) ? value : typeof value === "function" ? value() : standardSchemaValidator(value);
}
function standardSchemaValidator(standardSchema) {
    return validator(async (value)=>{
        const result = await standardSchema["~standard"].validate(value);
        return result.issues == null ? {
            success: true,
            value: result.value
        } : {
            success: false,
            error: new import_provider7.TypeValidationError({
                value,
                cause: result.issues
            })
        };
    });
}
// src/validate-types.ts
async function validateTypes({ value, schema }) {
    const result = await safeValidateTypes({
        value,
        schema
    });
    if (!result.success) {
        throw import_provider8.TypeValidationError.wrap({
            value,
            cause: result.error
        });
    }
    return result.value;
}
async function safeValidateTypes({ value, schema }) {
    const validator2 = asValidator(schema);
    try {
        if (validator2.validate == null) {
            return {
                success: true,
                value,
                rawValue: value
            };
        }
        const result = await validator2.validate(value);
        if (result.success) {
            return {
                success: true,
                value: result.value,
                rawValue: value
            };
        }
        return {
            success: false,
            error: import_provider8.TypeValidationError.wrap({
                value,
                cause: result.error
            }),
            rawValue: value
        };
    } catch (error) {
        return {
            success: false,
            error: import_provider8.TypeValidationError.wrap({
                value,
                cause: error
            }),
            rawValue: value
        };
    }
}
// src/parse-json.ts
async function parseJSON({ text, schema }) {
    try {
        const value = secureJsonParse(text);
        if (schema == null) {
            return value;
        }
        return validateTypes({
            value,
            schema
        });
    } catch (error) {
        if (import_provider9.JSONParseError.isInstance(error) || import_provider9.TypeValidationError.isInstance(error)) {
            throw error;
        }
        throw new import_provider9.JSONParseError({
            text,
            cause: error
        });
    }
}
async function safeParseJSON({ text, schema }) {
    try {
        const value = secureJsonParse(text);
        if (schema == null) {
            return {
                success: true,
                value,
                rawValue: value
            };
        }
        return await safeValidateTypes({
            value,
            schema
        });
    } catch (error) {
        return {
            success: false,
            error: import_provider9.JSONParseError.isInstance(error) ? error : new import_provider9.JSONParseError({
                text,
                cause: error
            }),
            rawValue: void 0
        };
    }
}
function isParsableJson(input) {
    try {
        secureJsonParse(input);
        return true;
    } catch (e) {
        return false;
    }
}
// src/parse-json-event-stream.ts
var import_stream = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/eventsource-parser@3.0.8/node_modules/eventsource-parser/dist/stream.cjs [instrumentation] (ecmascript)");
function parseJsonEventStream({ stream, schema }) {
    return stream.pipeThrough(new TextDecoderStream()).pipeThrough(new import_stream.EventSourceParserStream()).pipeThrough(new TransformStream({
        async transform ({ data }, controller) {
            if (data === "[DONE]") {
                return;
            }
            controller.enqueue(await safeParseJSON({
                text: data,
                schema
            }));
        }
    }));
}
// src/parse-provider-options.ts
var import_provider10 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@ai-sdk+provider@2.0.3/node_modules/@ai-sdk/provider/dist/index.js [instrumentation] (ecmascript)");
async function parseProviderOptions({ provider, providerOptions, schema }) {
    if ((providerOptions == null ? void 0 : providerOptions[provider]) == null) {
        return void 0;
    }
    const parsedProviderOptions = await safeValidateTypes({
        value: providerOptions[provider],
        schema
    });
    if (!parsedProviderOptions.success) {
        throw new import_provider10.InvalidArgumentError({
            argument: "providerOptions",
            message: `invalid ${provider} provider options`,
            cause: parsedProviderOptions.error
        });
    }
    return parsedProviderOptions.value;
}
// src/post-to-api.ts
var import_provider11 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@ai-sdk+provider@2.0.3/node_modules/@ai-sdk/provider/dist/index.js [instrumentation] (ecmascript)");
var getOriginalFetch2 = ()=>globalThis.fetch;
var postJsonToApi = async ({ url, headers, body, failedResponseHandler, successfulResponseHandler, abortSignal, fetch })=>postToApi({
        url,
        headers: {
            "Content-Type": "application/json",
            ...headers
        },
        body: {
            content: JSON.stringify(body),
            values: body
        },
        failedResponseHandler,
        successfulResponseHandler,
        abortSignal,
        fetch
    });
var postFormDataToApi = async ({ url, headers, formData, failedResponseHandler, successfulResponseHandler, abortSignal, fetch })=>postToApi({
        url,
        headers,
        body: {
            content: formData,
            values: Object.fromEntries(formData.entries())
        },
        failedResponseHandler,
        successfulResponseHandler,
        abortSignal,
        fetch
    });
var postToApi = async ({ url, headers = {}, body, successfulResponseHandler, failedResponseHandler, abortSignal, fetch = getOriginalFetch2() })=>{
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: withUserAgentSuffix(headers, `ai-sdk/provider-utils/${VERSION}`, getRuntimeEnvironmentUserAgent()),
            body: body.content,
            signal: abortSignal
        });
        const responseHeaders = extractResponseHeaders(response);
        if (!response.ok) {
            let errorInformation;
            try {
                errorInformation = await failedResponseHandler({
                    response,
                    url,
                    requestBodyValues: body.values
                });
            } catch (error) {
                if (isAbortError(error) || import_provider11.APICallError.isInstance(error)) {
                    throw error;
                }
                throw new import_provider11.APICallError({
                    message: "Failed to process error response",
                    cause: error,
                    statusCode: response.status,
                    url,
                    responseHeaders,
                    requestBodyValues: body.values
                });
            }
            throw errorInformation.value;
        }
        try {
            return await successfulResponseHandler({
                response,
                url,
                requestBodyValues: body.values
            });
        } catch (error) {
            if (error instanceof Error) {
                if (isAbortError(error) || import_provider11.APICallError.isInstance(error)) {
                    throw error;
                }
            }
            throw new import_provider11.APICallError({
                message: "Failed to process successful response",
                cause: error,
                statusCode: response.status,
                url,
                responseHeaders,
                requestBodyValues: body.values
            });
        }
    } catch (error) {
        throw handleFetchError({
            error,
            url,
            requestBodyValues: body.values
        });
    }
};
// src/types/tool.ts
function tool(tool2) {
    return tool2;
}
function dynamicTool(tool2) {
    return {
        ...tool2,
        type: "dynamic"
    };
}
// src/provider-defined-tool-factory.ts
function createProviderDefinedToolFactory({ id, name: name2, inputSchema }) {
    return ({ execute, outputSchema, toModelOutput, onInputStart, onInputDelta, onInputAvailable, ...args })=>tool({
            type: "provider-defined",
            id,
            name: name2,
            args,
            inputSchema,
            outputSchema,
            execute,
            toModelOutput,
            onInputStart,
            onInputDelta,
            onInputAvailable
        });
}
function createProviderDefinedToolFactoryWithOutputSchema({ id, name: name2, inputSchema, outputSchema }) {
    return ({ execute, toModelOutput, onInputStart, onInputDelta, onInputAvailable, ...args })=>tool({
            type: "provider-defined",
            id,
            name: name2,
            args,
            inputSchema,
            outputSchema,
            execute,
            toModelOutput,
            onInputStart,
            onInputDelta,
            onInputAvailable
        });
}
// src/remove-undefined-entries.ts
function removeUndefinedEntries(record) {
    return Object.fromEntries(Object.entries(record).filter(([_key, value])=>value != null));
}
// src/resolve.ts
async function resolve(value) {
    if (typeof value === "function") {
        value = value();
    }
    return Promise.resolve(value);
}
// src/response-handler.ts
var import_provider12 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@ai-sdk+provider@2.0.3/node_modules/@ai-sdk/provider/dist/index.js [instrumentation] (ecmascript)");
var createJsonErrorResponseHandler = ({ errorSchema, errorToMessage, isRetryable })=>async ({ response, url, requestBodyValues })=>{
        const responseBody = await response.text();
        const responseHeaders = extractResponseHeaders(response);
        if (responseBody.trim() === "") {
            return {
                responseHeaders,
                value: new import_provider12.APICallError({
                    message: response.statusText,
                    url,
                    requestBodyValues,
                    statusCode: response.status,
                    responseHeaders,
                    responseBody,
                    isRetryable: isRetryable == null ? void 0 : isRetryable(response)
                })
            };
        }
        try {
            const parsedError = await parseJSON({
                text: responseBody,
                schema: errorSchema
            });
            return {
                responseHeaders,
                value: new import_provider12.APICallError({
                    message: errorToMessage(parsedError),
                    url,
                    requestBodyValues,
                    statusCode: response.status,
                    responseHeaders,
                    responseBody,
                    data: parsedError,
                    isRetryable: isRetryable == null ? void 0 : isRetryable(response, parsedError)
                })
            };
        } catch (parseError) {
            return {
                responseHeaders,
                value: new import_provider12.APICallError({
                    message: response.statusText,
                    url,
                    requestBodyValues,
                    statusCode: response.status,
                    responseHeaders,
                    responseBody,
                    isRetryable: isRetryable == null ? void 0 : isRetryable(response)
                })
            };
        }
    };
var createEventSourceResponseHandler = (chunkSchema)=>async ({ response })=>{
        const responseHeaders = extractResponseHeaders(response);
        if (response.body == null) {
            throw new import_provider12.EmptyResponseBodyError({});
        }
        return {
            responseHeaders,
            value: parseJsonEventStream({
                stream: response.body,
                schema: chunkSchema
            })
        };
    };
var createJsonStreamResponseHandler = (chunkSchema)=>async ({ response })=>{
        const responseHeaders = extractResponseHeaders(response);
        if (response.body == null) {
            throw new import_provider12.EmptyResponseBodyError({});
        }
        let buffer = "";
        return {
            responseHeaders,
            value: response.body.pipeThrough(new TextDecoderStream()).pipeThrough(new TransformStream({
                async transform (chunkText, controller) {
                    if (chunkText.endsWith("\n")) {
                        controller.enqueue(await safeParseJSON({
                            text: buffer + chunkText,
                            schema: chunkSchema
                        }));
                        buffer = "";
                    } else {
                        buffer += chunkText;
                    }
                }
            }))
        };
    };
var createJsonResponseHandler = (responseSchema)=>async ({ response, url, requestBodyValues })=>{
        const responseBody = await response.text();
        const parsedResult = await safeParseJSON({
            text: responseBody,
            schema: responseSchema
        });
        const responseHeaders = extractResponseHeaders(response);
        if (!parsedResult.success) {
            throw new import_provider12.APICallError({
                message: "Invalid JSON response",
                cause: parsedResult.error,
                statusCode: response.status,
                responseHeaders,
                responseBody,
                url,
                requestBodyValues
            });
        }
        return {
            responseHeaders,
            value: parsedResult.value,
            rawValue: parsedResult.rawValue
        };
    };
var createBinaryResponseHandler = ()=>async ({ response, url, requestBodyValues })=>{
        const responseHeaders = extractResponseHeaders(response);
        if (!response.body) {
            throw new import_provider12.APICallError({
                message: "Response body is empty",
                url,
                requestBodyValues,
                statusCode: response.status,
                responseHeaders,
                responseBody: void 0
            });
        }
        try {
            const buffer = await response.arrayBuffer();
            return {
                responseHeaders,
                value: new Uint8Array(buffer)
            };
        } catch (error) {
            throw new import_provider12.APICallError({
                message: "Failed to read response as array buffer",
                url,
                requestBodyValues,
                statusCode: response.status,
                responseHeaders,
                responseBody: void 0,
                cause: error
            });
        }
    };
var createStatusCodeErrorResponseHandler = ()=>async ({ response, url, requestBodyValues })=>{
        const responseHeaders = extractResponseHeaders(response);
        const responseBody = await response.text();
        return {
            responseHeaders,
            value: new import_provider12.APICallError({
                message: response.statusText,
                url,
                requestBodyValues,
                statusCode: response.status,
                responseHeaders,
                responseBody
            })
        };
    };
// src/schema.ts
var schemaSymbol = /* @__PURE__ */ Symbol.for("vercel.ai.schema");
function lazySchema(createSchema) {
    let schema;
    return ()=>{
        if (schema == null) {
            schema = createSchema();
        }
        return schema;
    };
}
function jsonSchema(jsonSchema2, { validate } = {}) {
    return {
        [schemaSymbol]: true,
        _type: void 0,
        // should never be used directly
        [validatorSymbol]: true,
        get jsonSchema () {
            if (typeof jsonSchema2 === "function") {
                jsonSchema2 = jsonSchema2();
            }
            return jsonSchema2;
        },
        validate
    };
}
// src/zod-schema.ts
var z4 = __toESM(__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod@3.25.76/node_modules/zod/v4/index.cjs [instrumentation] (ecmascript)"));
// src/add-additional-properties-to-json-schema.ts
function addAdditionalPropertiesToJsonSchema(jsonSchema2) {
    if (jsonSchema2.type === "object") {
        jsonSchema2.additionalProperties = false;
        const properties = jsonSchema2.properties;
        if (properties != null) {
            for(const property in properties){
                properties[property] = addAdditionalPropertiesToJsonSchema(properties[property]);
            }
        }
    }
    if (jsonSchema2.type === "array" && jsonSchema2.items != null) {
        if (Array.isArray(jsonSchema2.items)) {
            jsonSchema2.items = jsonSchema2.items.map((item)=>addAdditionalPropertiesToJsonSchema(item));
        } else {
            jsonSchema2.items = addAdditionalPropertiesToJsonSchema(jsonSchema2.items);
        }
    }
    return jsonSchema2;
}
// src/zod-to-json-schema/options.ts
var ignoreOverride = /* @__PURE__ */ Symbol("Let zodToJsonSchema decide on which parser to use");
var defaultOptions = {
    name: void 0,
    $refStrategy: "root",
    basePath: [
        "#"
    ],
    effectStrategy: "input",
    pipeStrategy: "all",
    dateStrategy: "format:date-time",
    mapStrategy: "entries",
    removeAdditionalStrategy: "passthrough",
    allowedAdditionalProperties: true,
    rejectedAdditionalProperties: false,
    definitionPath: "definitions",
    strictUnions: false,
    definitions: {},
    errorMessages: false,
    patternStrategy: "escape",
    applyRegexFlags: false,
    emailStrategy: "format:email",
    base64Strategy: "contentEncoding:base64",
    nameStrategy: "ref"
};
var getDefaultOptions = (options)=>typeof options === "string" ? {
        ...defaultOptions,
        name: options
    } : {
        ...defaultOptions,
        ...options
    };
// src/zod-to-json-schema/select-parser.ts
var import_v33 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/index.cjs [instrumentation] (ecmascript)");
// src/zod-to-json-schema/parsers/any.ts
function parseAnyDef() {
    return {};
}
// src/zod-to-json-schema/parsers/array.ts
var import_v3 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/index.cjs [instrumentation] (ecmascript)");
function parseArrayDef(def, refs) {
    var _a2, _b2, _c;
    const res = {
        type: "array"
    };
    if (((_a2 = def.type) == null ? void 0 : _a2._def) && ((_c = (_b2 = def.type) == null ? void 0 : _b2._def) == null ? void 0 : _c.typeName) !== import_v3.ZodFirstPartyTypeKind.ZodAny) {
        res.items = parseDef(def.type._def, {
            ...refs,
            currentPath: [
                ...refs.currentPath,
                "items"
            ]
        });
    }
    if (def.minLength) {
        res.minItems = def.minLength.value;
    }
    if (def.maxLength) {
        res.maxItems = def.maxLength.value;
    }
    if (def.exactLength) {
        res.minItems = def.exactLength.value;
        res.maxItems = def.exactLength.value;
    }
    return res;
}
// src/zod-to-json-schema/parsers/bigint.ts
function parseBigintDef(def) {
    const res = {
        type: "integer",
        format: "int64"
    };
    if (!def.checks) return res;
    for (const check of def.checks){
        switch(check.kind){
            case "min":
                if (check.inclusive) {
                    res.minimum = check.value;
                } else {
                    res.exclusiveMinimum = check.value;
                }
                break;
            case "max":
                if (check.inclusive) {
                    res.maximum = check.value;
                } else {
                    res.exclusiveMaximum = check.value;
                }
                break;
            case "multipleOf":
                res.multipleOf = check.value;
                break;
        }
    }
    return res;
}
// src/zod-to-json-schema/parsers/boolean.ts
function parseBooleanDef() {
    return {
        type: "boolean"
    };
}
// src/zod-to-json-schema/parsers/branded.ts
function parseBrandedDef(_def, refs) {
    return parseDef(_def.type._def, refs);
}
// src/zod-to-json-schema/parsers/catch.ts
var parseCatchDef = (def, refs)=>{
    return parseDef(def.innerType._def, refs);
};
// src/zod-to-json-schema/parsers/date.ts
function parseDateDef(def, refs, overrideDateStrategy) {
    const strategy = overrideDateStrategy != null ? overrideDateStrategy : refs.dateStrategy;
    if (Array.isArray(strategy)) {
        return {
            anyOf: strategy.map((item, i)=>parseDateDef(def, refs, item))
        };
    }
    switch(strategy){
        case "string":
        case "format:date-time":
            return {
                type: "string",
                format: "date-time"
            };
        case "format:date":
            return {
                type: "string",
                format: "date"
            };
        case "integer":
            return integerDateParser(def);
    }
}
var integerDateParser = (def)=>{
    const res = {
        type: "integer",
        format: "unix-time"
    };
    for (const check of def.checks){
        switch(check.kind){
            case "min":
                res.minimum = check.value;
                break;
            case "max":
                res.maximum = check.value;
                break;
        }
    }
    return res;
};
// src/zod-to-json-schema/parsers/default.ts
function parseDefaultDef(_def, refs) {
    return {
        ...parseDef(_def.innerType._def, refs),
        default: _def.defaultValue()
    };
}
// src/zod-to-json-schema/parsers/effects.ts
function parseEffectsDef(_def, refs) {
    return refs.effectStrategy === "input" ? parseDef(_def.schema._def, refs) : parseAnyDef();
}
// src/zod-to-json-schema/parsers/enum.ts
function parseEnumDef(def) {
    return {
        type: "string",
        enum: Array.from(def.values)
    };
}
// src/zod-to-json-schema/parsers/intersection.ts
var isJsonSchema7AllOfType = (type)=>{
    if ("type" in type && type.type === "string") return false;
    return "allOf" in type;
};
function parseIntersectionDef(def, refs) {
    const allOf = [
        parseDef(def.left._def, {
            ...refs,
            currentPath: [
                ...refs.currentPath,
                "allOf",
                "0"
            ]
        }),
        parseDef(def.right._def, {
            ...refs,
            currentPath: [
                ...refs.currentPath,
                "allOf",
                "1"
            ]
        })
    ].filter((x)=>!!x);
    const mergedAllOf = [];
    allOf.forEach((schema)=>{
        if (isJsonSchema7AllOfType(schema)) {
            mergedAllOf.push(...schema.allOf);
        } else {
            let nestedSchema = schema;
            if ("additionalProperties" in schema && schema.additionalProperties === false) {
                const { additionalProperties, ...rest } = schema;
                nestedSchema = rest;
            }
            mergedAllOf.push(nestedSchema);
        }
    });
    return mergedAllOf.length ? {
        allOf: mergedAllOf
    } : void 0;
}
// src/zod-to-json-schema/parsers/literal.ts
function parseLiteralDef(def) {
    const parsedType = typeof def.value;
    if (parsedType !== "bigint" && parsedType !== "number" && parsedType !== "boolean" && parsedType !== "string") {
        return {
            type: Array.isArray(def.value) ? "array" : "object"
        };
    }
    return {
        type: parsedType === "bigint" ? "integer" : parsedType,
        const: def.value
    };
}
// src/zod-to-json-schema/parsers/record.ts
var import_v32 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/index.cjs [instrumentation] (ecmascript)");
// src/zod-to-json-schema/parsers/string.ts
var emojiRegex = void 0;
var zodPatterns = {
    /**
   * `c` was changed to `[cC]` to replicate /i flag
   */ cuid: /^[cC][^\s-]{8,}$/,
    cuid2: /^[0-9a-z]+$/,
    ulid: /^[0-9A-HJKMNP-TV-Z]{26}$/,
    /**
   * `a-z` was added to replicate /i flag
   */ email: /^(?!\.)(?!.*\.\.)([a-zA-Z0-9_'+\-\.]*)[a-zA-Z0-9_+-]@([a-zA-Z0-9][a-zA-Z0-9\-]*\.)+[a-zA-Z]{2,}$/,
    /**
   * Constructed a valid Unicode RegExp
   *
   * Lazily instantiate since this type of regex isn't supported
   * in all envs (e.g. React Native).
   *
   * See:
   * https://github.com/colinhacks/zod/issues/2433
   * Fix in Zod:
   * https://github.com/colinhacks/zod/commit/9340fd51e48576a75adc919bff65dbc4a5d4c99b
   */ emoji: ()=>{
        if (emojiRegex === void 0) {
            emojiRegex = RegExp("^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$", "u");
        }
        return emojiRegex;
    },
    /**
   * Unused
   */ uuid: /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/,
    /**
   * Unused
   */ ipv4: /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/,
    ipv4Cidr: /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/,
    /**
   * Unused
   */ ipv6: /^(([a-f0-9]{1,4}:){7}|::([a-f0-9]{1,4}:){0,6}|([a-f0-9]{1,4}:){1}:([a-f0-9]{1,4}:){0,5}|([a-f0-9]{1,4}:){2}:([a-f0-9]{1,4}:){0,4}|([a-f0-9]{1,4}:){3}:([a-f0-9]{1,4}:){0,3}|([a-f0-9]{1,4}:){4}:([a-f0-9]{1,4}:){0,2}|([a-f0-9]{1,4}:){5}:([a-f0-9]{1,4}:){0,1})([a-f0-9]{1,4}|(((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2}))\.){3}((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2})))$/,
    ipv6Cidr: /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/,
    base64: /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/,
    base64url: /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/,
    nanoid: /^[a-zA-Z0-9_-]{21}$/,
    jwt: /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/
};
function parseStringDef(def, refs) {
    const res = {
        type: "string"
    };
    if (def.checks) {
        for (const check of def.checks){
            switch(check.kind){
                case "min":
                    res.minLength = typeof res.minLength === "number" ? Math.max(res.minLength, check.value) : check.value;
                    break;
                case "max":
                    res.maxLength = typeof res.maxLength === "number" ? Math.min(res.maxLength, check.value) : check.value;
                    break;
                case "email":
                    switch(refs.emailStrategy){
                        case "format:email":
                            addFormat(res, "email", check.message, refs);
                            break;
                        case "format:idn-email":
                            addFormat(res, "idn-email", check.message, refs);
                            break;
                        case "pattern:zod":
                            addPattern(res, zodPatterns.email, check.message, refs);
                            break;
                    }
                    break;
                case "url":
                    addFormat(res, "uri", check.message, refs);
                    break;
                case "uuid":
                    addFormat(res, "uuid", check.message, refs);
                    break;
                case "regex":
                    addPattern(res, check.regex, check.message, refs);
                    break;
                case "cuid":
                    addPattern(res, zodPatterns.cuid, check.message, refs);
                    break;
                case "cuid2":
                    addPattern(res, zodPatterns.cuid2, check.message, refs);
                    break;
                case "startsWith":
                    addPattern(res, RegExp(`^${escapeLiteralCheckValue(check.value, refs)}`), check.message, refs);
                    break;
                case "endsWith":
                    addPattern(res, RegExp(`${escapeLiteralCheckValue(check.value, refs)}$`), check.message, refs);
                    break;
                case "datetime":
                    addFormat(res, "date-time", check.message, refs);
                    break;
                case "date":
                    addFormat(res, "date", check.message, refs);
                    break;
                case "time":
                    addFormat(res, "time", check.message, refs);
                    break;
                case "duration":
                    addFormat(res, "duration", check.message, refs);
                    break;
                case "length":
                    res.minLength = typeof res.minLength === "number" ? Math.max(res.minLength, check.value) : check.value;
                    res.maxLength = typeof res.maxLength === "number" ? Math.min(res.maxLength, check.value) : check.value;
                    break;
                case "includes":
                    {
                        addPattern(res, RegExp(escapeLiteralCheckValue(check.value, refs)), check.message, refs);
                        break;
                    }
                case "ip":
                    {
                        if (check.version !== "v6") {
                            addFormat(res, "ipv4", check.message, refs);
                        }
                        if (check.version !== "v4") {
                            addFormat(res, "ipv6", check.message, refs);
                        }
                        break;
                    }
                case "base64url":
                    addPattern(res, zodPatterns.base64url, check.message, refs);
                    break;
                case "jwt":
                    addPattern(res, zodPatterns.jwt, check.message, refs);
                    break;
                case "cidr":
                    {
                        if (check.version !== "v6") {
                            addPattern(res, zodPatterns.ipv4Cidr, check.message, refs);
                        }
                        if (check.version !== "v4") {
                            addPattern(res, zodPatterns.ipv6Cidr, check.message, refs);
                        }
                        break;
                    }
                case "emoji":
                    addPattern(res, zodPatterns.emoji(), check.message, refs);
                    break;
                case "ulid":
                    {
                        addPattern(res, zodPatterns.ulid, check.message, refs);
                        break;
                    }
                case "base64":
                    {
                        switch(refs.base64Strategy){
                            case "format:binary":
                                {
                                    addFormat(res, "binary", check.message, refs);
                                    break;
                                }
                            case "contentEncoding:base64":
                                {
                                    res.contentEncoding = "base64";
                                    break;
                                }
                            case "pattern:zod":
                                {
                                    addPattern(res, zodPatterns.base64, check.message, refs);
                                    break;
                                }
                        }
                        break;
                    }
                case "nanoid":
                    {
                        addPattern(res, zodPatterns.nanoid, check.message, refs);
                    }
                case "toLowerCase":
                case "toUpperCase":
                case "trim":
                    break;
                default:
                    /* @__PURE__ */ ((_)=>{})(check);
            }
        }
    }
    return res;
}
function escapeLiteralCheckValue(literal, refs) {
    return refs.patternStrategy === "escape" ? escapeNonAlphaNumeric(literal) : literal;
}
var ALPHA_NUMERIC = new Set("ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvxyz0123456789");
function escapeNonAlphaNumeric(source) {
    let result = "";
    for(let i = 0; i < source.length; i++){
        if (!ALPHA_NUMERIC.has(source[i])) {
            result += "\\";
        }
        result += source[i];
    }
    return result;
}
function addFormat(schema, value, message, refs) {
    var _a2;
    if (schema.format || ((_a2 = schema.anyOf) == null ? void 0 : _a2.some((x)=>x.format))) {
        if (!schema.anyOf) {
            schema.anyOf = [];
        }
        if (schema.format) {
            schema.anyOf.push({
                format: schema.format
            });
            delete schema.format;
        }
        schema.anyOf.push({
            format: value,
            ...message && refs.errorMessages && {
                errorMessage: {
                    format: message
                }
            }
        });
    } else {
        schema.format = value;
    }
}
function addPattern(schema, regex, message, refs) {
    var _a2;
    if (schema.pattern || ((_a2 = schema.allOf) == null ? void 0 : _a2.some((x)=>x.pattern))) {
        if (!schema.allOf) {
            schema.allOf = [];
        }
        if (schema.pattern) {
            schema.allOf.push({
                pattern: schema.pattern
            });
            delete schema.pattern;
        }
        schema.allOf.push({
            pattern: stringifyRegExpWithFlags(regex, refs),
            ...message && refs.errorMessages && {
                errorMessage: {
                    pattern: message
                }
            }
        });
    } else {
        schema.pattern = stringifyRegExpWithFlags(regex, refs);
    }
}
function stringifyRegExpWithFlags(regex, refs) {
    var _a2;
    if (!refs.applyRegexFlags || !regex.flags) {
        return regex.source;
    }
    const flags = {
        i: regex.flags.includes("i"),
        // Case-insensitive
        m: regex.flags.includes("m"),
        // `^` and `$` matches adjacent to newline characters
        s: regex.flags.includes("s")
    };
    const source = flags.i ? regex.source.toLowerCase() : regex.source;
    let pattern = "";
    let isEscaped = false;
    let inCharGroup = false;
    let inCharRange = false;
    for(let i = 0; i < source.length; i++){
        if (isEscaped) {
            pattern += source[i];
            isEscaped = false;
            continue;
        }
        if (flags.i) {
            if (inCharGroup) {
                if (source[i].match(/[a-z]/)) {
                    if (inCharRange) {
                        pattern += source[i];
                        pattern += `${source[i - 2]}-${source[i]}`.toUpperCase();
                        inCharRange = false;
                    } else if (source[i + 1] === "-" && ((_a2 = source[i + 2]) == null ? void 0 : _a2.match(/[a-z]/))) {
                        pattern += source[i];
                        inCharRange = true;
                    } else {
                        pattern += `${source[i]}${source[i].toUpperCase()}`;
                    }
                    continue;
                }
            } else if (source[i].match(/[a-z]/)) {
                pattern += `[${source[i]}${source[i].toUpperCase()}]`;
                continue;
            }
        }
        if (flags.m) {
            if (source[i] === "^") {
                pattern += `(^|(?<=[\r
]))`;
                continue;
            } else if (source[i] === "$") {
                pattern += `($|(?=[\r
]))`;
                continue;
            }
        }
        if (flags.s && source[i] === ".") {
            pattern += inCharGroup ? `${source[i]}\r
` : `[${source[i]}\r
]`;
            continue;
        }
        pattern += source[i];
        if (source[i] === "\\") {
            isEscaped = true;
        } else if (inCharGroup && source[i] === "]") {
            inCharGroup = false;
        } else if (!inCharGroup && source[i] === "[") {
            inCharGroup = true;
        }
    }
    try {
        new RegExp(pattern);
    } catch (e) {
        console.warn(`Could not convert regex pattern at ${refs.currentPath.join("/")} to a flag-independent form! Falling back to the flag-ignorant source`);
        return regex.source;
    }
    return pattern;
}
// src/zod-to-json-schema/parsers/record.ts
function parseRecordDef(def, refs) {
    var _a2, _b2, _c, _d, _e, _f;
    const schema = {
        type: "object",
        additionalProperties: (_a2 = parseDef(def.valueType._def, {
            ...refs,
            currentPath: [
                ...refs.currentPath,
                "additionalProperties"
            ]
        })) != null ? _a2 : refs.allowedAdditionalProperties
    };
    if (((_b2 = def.keyType) == null ? void 0 : _b2._def.typeName) === import_v32.ZodFirstPartyTypeKind.ZodString && ((_c = def.keyType._def.checks) == null ? void 0 : _c.length)) {
        const { type, ...keyType } = parseStringDef(def.keyType._def, refs);
        return {
            ...schema,
            propertyNames: keyType
        };
    } else if (((_d = def.keyType) == null ? void 0 : _d._def.typeName) === import_v32.ZodFirstPartyTypeKind.ZodEnum) {
        return {
            ...schema,
            propertyNames: {
                enum: def.keyType._def.values
            }
        };
    } else if (((_e = def.keyType) == null ? void 0 : _e._def.typeName) === import_v32.ZodFirstPartyTypeKind.ZodBranded && def.keyType._def.type._def.typeName === import_v32.ZodFirstPartyTypeKind.ZodString && ((_f = def.keyType._def.type._def.checks) == null ? void 0 : _f.length)) {
        const { type, ...keyType } = parseBrandedDef(def.keyType._def, refs);
        return {
            ...schema,
            propertyNames: keyType
        };
    }
    return schema;
}
// src/zod-to-json-schema/parsers/map.ts
function parseMapDef(def, refs) {
    if (refs.mapStrategy === "record") {
        return parseRecordDef(def, refs);
    }
    const keys = parseDef(def.keyType._def, {
        ...refs,
        currentPath: [
            ...refs.currentPath,
            "items",
            "items",
            "0"
        ]
    }) || parseAnyDef();
    const values = parseDef(def.valueType._def, {
        ...refs,
        currentPath: [
            ...refs.currentPath,
            "items",
            "items",
            "1"
        ]
    }) || parseAnyDef();
    return {
        type: "array",
        maxItems: 125,
        items: {
            type: "array",
            items: [
                keys,
                values
            ],
            minItems: 2,
            maxItems: 2
        }
    };
}
// src/zod-to-json-schema/parsers/native-enum.ts
function parseNativeEnumDef(def) {
    const object = def.values;
    const actualKeys = Object.keys(def.values).filter((key)=>{
        return typeof object[object[key]] !== "number";
    });
    const actualValues = actualKeys.map((key)=>object[key]);
    const parsedTypes = Array.from(new Set(actualValues.map((values)=>typeof values)));
    return {
        type: parsedTypes.length === 1 ? parsedTypes[0] === "string" ? "string" : "number" : [
            "string",
            "number"
        ],
        enum: actualValues
    };
}
// src/zod-to-json-schema/parsers/never.ts
function parseNeverDef() {
    return {
        not: parseAnyDef()
    };
}
// src/zod-to-json-schema/parsers/null.ts
function parseNullDef() {
    return {
        type: "null"
    };
}
// src/zod-to-json-schema/parsers/union.ts
var primitiveMappings = {
    ZodString: "string",
    ZodNumber: "number",
    ZodBigInt: "integer",
    ZodBoolean: "boolean",
    ZodNull: "null"
};
function parseUnionDef(def, refs) {
    const options = def.options instanceof Map ? Array.from(def.options.values()) : def.options;
    if (options.every((x)=>x._def.typeName in primitiveMappings && (!x._def.checks || !x._def.checks.length))) {
        const types = options.reduce((types2, x)=>{
            const type = primitiveMappings[x._def.typeName];
            return type && !types2.includes(type) ? [
                ...types2,
                type
            ] : types2;
        }, []);
        return {
            type: types.length > 1 ? types : types[0]
        };
    } else if (options.every((x)=>x._def.typeName === "ZodLiteral" && !x.description)) {
        const types = options.reduce((acc, x)=>{
            const type = typeof x._def.value;
            switch(type){
                case "string":
                case "number":
                case "boolean":
                    return [
                        ...acc,
                        type
                    ];
                case "bigint":
                    return [
                        ...acc,
                        "integer"
                    ];
                case "object":
                    if (x._def.value === null) return [
                        ...acc,
                        "null"
                    ];
                case "symbol":
                case "undefined":
                case "function":
                default:
                    return acc;
            }
        }, []);
        if (types.length === options.length) {
            const uniqueTypes = types.filter((x, i, a)=>a.indexOf(x) === i);
            return {
                type: uniqueTypes.length > 1 ? uniqueTypes : uniqueTypes[0],
                enum: options.reduce((acc, x)=>{
                    return acc.includes(x._def.value) ? acc : [
                        ...acc,
                        x._def.value
                    ];
                }, [])
            };
        }
    } else if (options.every((x)=>x._def.typeName === "ZodEnum")) {
        return {
            type: "string",
            enum: options.reduce((acc, x)=>[
                    ...acc,
                    ...x._def.values.filter((x2)=>!acc.includes(x2))
                ], [])
        };
    }
    return asAnyOf(def, refs);
}
var asAnyOf = (def, refs)=>{
    const anyOf = (def.options instanceof Map ? Array.from(def.options.values()) : def.options).map((x, i)=>parseDef(x._def, {
            ...refs,
            currentPath: [
                ...refs.currentPath,
                "anyOf",
                `${i}`
            ]
        })).filter((x)=>!!x && (!refs.strictUnions || typeof x === "object" && Object.keys(x).length > 0));
    return anyOf.length ? {
        anyOf
    } : void 0;
};
// src/zod-to-json-schema/parsers/nullable.ts
function parseNullableDef(def, refs) {
    if ([
        "ZodString",
        "ZodNumber",
        "ZodBigInt",
        "ZodBoolean",
        "ZodNull"
    ].includes(def.innerType._def.typeName) && (!def.innerType._def.checks || !def.innerType._def.checks.length)) {
        return {
            type: [
                primitiveMappings[def.innerType._def.typeName],
                "null"
            ]
        };
    }
    const base = parseDef(def.innerType._def, {
        ...refs,
        currentPath: [
            ...refs.currentPath,
            "anyOf",
            "0"
        ]
    });
    return base && {
        anyOf: [
            base,
            {
                type: "null"
            }
        ]
    };
}
// src/zod-to-json-schema/parsers/number.ts
function parseNumberDef(def) {
    const res = {
        type: "number"
    };
    if (!def.checks) return res;
    for (const check of def.checks){
        switch(check.kind){
            case "int":
                res.type = "integer";
                break;
            case "min":
                if (check.inclusive) {
                    res.minimum = check.value;
                } else {
                    res.exclusiveMinimum = check.value;
                }
                break;
            case "max":
                if (check.inclusive) {
                    res.maximum = check.value;
                } else {
                    res.exclusiveMaximum = check.value;
                }
                break;
            case "multipleOf":
                res.multipleOf = check.value;
                break;
        }
    }
    return res;
}
// src/zod-to-json-schema/parsers/object.ts
function parseObjectDef(def, refs) {
    const result = {
        type: "object",
        properties: {}
    };
    const required = [];
    const shape = def.shape();
    for(const propName in shape){
        let propDef = shape[propName];
        if (propDef === void 0 || propDef._def === void 0) {
            continue;
        }
        const propOptional = safeIsOptional(propDef);
        const parsedDef = parseDef(propDef._def, {
            ...refs,
            currentPath: [
                ...refs.currentPath,
                "properties",
                propName
            ],
            propertyPath: [
                ...refs.currentPath,
                "properties",
                propName
            ]
        });
        if (parsedDef === void 0) {
            continue;
        }
        result.properties[propName] = parsedDef;
        if (!propOptional) {
            required.push(propName);
        }
    }
    if (required.length) {
        result.required = required;
    }
    const additionalProperties = decideAdditionalProperties(def, refs);
    if (additionalProperties !== void 0) {
        result.additionalProperties = additionalProperties;
    }
    return result;
}
function decideAdditionalProperties(def, refs) {
    if (def.catchall._def.typeName !== "ZodNever") {
        return parseDef(def.catchall._def, {
            ...refs,
            currentPath: [
                ...refs.currentPath,
                "additionalProperties"
            ]
        });
    }
    switch(def.unknownKeys){
        case "passthrough":
            return refs.allowedAdditionalProperties;
        case "strict":
            return refs.rejectedAdditionalProperties;
        case "strip":
            return refs.removeAdditionalStrategy === "strict" ? refs.allowedAdditionalProperties : refs.rejectedAdditionalProperties;
    }
}
function safeIsOptional(schema) {
    try {
        return schema.isOptional();
    } catch (e) {
        return true;
    }
}
// src/zod-to-json-schema/parsers/optional.ts
var parseOptionalDef = (def, refs)=>{
    var _a2;
    if (refs.currentPath.toString() === ((_a2 = refs.propertyPath) == null ? void 0 : _a2.toString())) {
        return parseDef(def.innerType._def, refs);
    }
    const innerSchema = parseDef(def.innerType._def, {
        ...refs,
        currentPath: [
            ...refs.currentPath,
            "anyOf",
            "1"
        ]
    });
    return innerSchema ? {
        anyOf: [
            {
                not: parseAnyDef()
            },
            innerSchema
        ]
    } : parseAnyDef();
};
// src/zod-to-json-schema/parsers/pipeline.ts
var parsePipelineDef = (def, refs)=>{
    if (refs.pipeStrategy === "input") {
        return parseDef(def.in._def, refs);
    } else if (refs.pipeStrategy === "output") {
        return parseDef(def.out._def, refs);
    }
    const a = parseDef(def.in._def, {
        ...refs,
        currentPath: [
            ...refs.currentPath,
            "allOf",
            "0"
        ]
    });
    const b = parseDef(def.out._def, {
        ...refs,
        currentPath: [
            ...refs.currentPath,
            "allOf",
            a ? "1" : "0"
        ]
    });
    return {
        allOf: [
            a,
            b
        ].filter((x)=>x !== void 0)
    };
};
// src/zod-to-json-schema/parsers/promise.ts
function parsePromiseDef(def, refs) {
    return parseDef(def.type._def, refs);
}
// src/zod-to-json-schema/parsers/set.ts
function parseSetDef(def, refs) {
    const items = parseDef(def.valueType._def, {
        ...refs,
        currentPath: [
            ...refs.currentPath,
            "items"
        ]
    });
    const schema = {
        type: "array",
        uniqueItems: true,
        items
    };
    if (def.minSize) {
        schema.minItems = def.minSize.value;
    }
    if (def.maxSize) {
        schema.maxItems = def.maxSize.value;
    }
    return schema;
}
// src/zod-to-json-schema/parsers/tuple.ts
function parseTupleDef(def, refs) {
    if (def.rest) {
        return {
            type: "array",
            minItems: def.items.length,
            items: def.items.map((x, i)=>parseDef(x._def, {
                    ...refs,
                    currentPath: [
                        ...refs.currentPath,
                        "items",
                        `${i}`
                    ]
                })).reduce((acc, x)=>x === void 0 ? acc : [
                    ...acc,
                    x
                ], []),
            additionalItems: parseDef(def.rest._def, {
                ...refs,
                currentPath: [
                    ...refs.currentPath,
                    "additionalItems"
                ]
            })
        };
    } else {
        return {
            type: "array",
            minItems: def.items.length,
            maxItems: def.items.length,
            items: def.items.map((x, i)=>parseDef(x._def, {
                    ...refs,
                    currentPath: [
                        ...refs.currentPath,
                        "items",
                        `${i}`
                    ]
                })).reduce((acc, x)=>x === void 0 ? acc : [
                    ...acc,
                    x
                ], [])
        };
    }
}
// src/zod-to-json-schema/parsers/undefined.ts
function parseUndefinedDef() {
    return {
        not: parseAnyDef()
    };
}
// src/zod-to-json-schema/parsers/unknown.ts
function parseUnknownDef() {
    return parseAnyDef();
}
// src/zod-to-json-schema/parsers/readonly.ts
var parseReadonlyDef = (def, refs)=>{
    return parseDef(def.innerType._def, refs);
};
// src/zod-to-json-schema/select-parser.ts
var selectParser = (def, typeName, refs)=>{
    switch(typeName){
        case import_v33.ZodFirstPartyTypeKind.ZodString:
            return parseStringDef(def, refs);
        case import_v33.ZodFirstPartyTypeKind.ZodNumber:
            return parseNumberDef(def);
        case import_v33.ZodFirstPartyTypeKind.ZodObject:
            return parseObjectDef(def, refs);
        case import_v33.ZodFirstPartyTypeKind.ZodBigInt:
            return parseBigintDef(def);
        case import_v33.ZodFirstPartyTypeKind.ZodBoolean:
            return parseBooleanDef();
        case import_v33.ZodFirstPartyTypeKind.ZodDate:
            return parseDateDef(def, refs);
        case import_v33.ZodFirstPartyTypeKind.ZodUndefined:
            return parseUndefinedDef();
        case import_v33.ZodFirstPartyTypeKind.ZodNull:
            return parseNullDef();
        case import_v33.ZodFirstPartyTypeKind.ZodArray:
            return parseArrayDef(def, refs);
        case import_v33.ZodFirstPartyTypeKind.ZodUnion:
        case import_v33.ZodFirstPartyTypeKind.ZodDiscriminatedUnion:
            return parseUnionDef(def, refs);
        case import_v33.ZodFirstPartyTypeKind.ZodIntersection:
            return parseIntersectionDef(def, refs);
        case import_v33.ZodFirstPartyTypeKind.ZodTuple:
            return parseTupleDef(def, refs);
        case import_v33.ZodFirstPartyTypeKind.ZodRecord:
            return parseRecordDef(def, refs);
        case import_v33.ZodFirstPartyTypeKind.ZodLiteral:
            return parseLiteralDef(def);
        case import_v33.ZodFirstPartyTypeKind.ZodEnum:
            return parseEnumDef(def);
        case import_v33.ZodFirstPartyTypeKind.ZodNativeEnum:
            return parseNativeEnumDef(def);
        case import_v33.ZodFirstPartyTypeKind.ZodNullable:
            return parseNullableDef(def, refs);
        case import_v33.ZodFirstPartyTypeKind.ZodOptional:
            return parseOptionalDef(def, refs);
        case import_v33.ZodFirstPartyTypeKind.ZodMap:
            return parseMapDef(def, refs);
        case import_v33.ZodFirstPartyTypeKind.ZodSet:
            return parseSetDef(def, refs);
        case import_v33.ZodFirstPartyTypeKind.ZodLazy:
            return ()=>def.getter()._def;
        case import_v33.ZodFirstPartyTypeKind.ZodPromise:
            return parsePromiseDef(def, refs);
        case import_v33.ZodFirstPartyTypeKind.ZodNaN:
        case import_v33.ZodFirstPartyTypeKind.ZodNever:
            return parseNeverDef();
        case import_v33.ZodFirstPartyTypeKind.ZodEffects:
            return parseEffectsDef(def, refs);
        case import_v33.ZodFirstPartyTypeKind.ZodAny:
            return parseAnyDef();
        case import_v33.ZodFirstPartyTypeKind.ZodUnknown:
            return parseUnknownDef();
        case import_v33.ZodFirstPartyTypeKind.ZodDefault:
            return parseDefaultDef(def, refs);
        case import_v33.ZodFirstPartyTypeKind.ZodBranded:
            return parseBrandedDef(def, refs);
        case import_v33.ZodFirstPartyTypeKind.ZodReadonly:
            return parseReadonlyDef(def, refs);
        case import_v33.ZodFirstPartyTypeKind.ZodCatch:
            return parseCatchDef(def, refs);
        case import_v33.ZodFirstPartyTypeKind.ZodPipeline:
            return parsePipelineDef(def, refs);
        case import_v33.ZodFirstPartyTypeKind.ZodFunction:
        case import_v33.ZodFirstPartyTypeKind.ZodVoid:
        case import_v33.ZodFirstPartyTypeKind.ZodSymbol:
            return void 0;
        default:
            return /* @__PURE__ */ ((_)=>void 0)(typeName);
    }
};
// src/zod-to-json-schema/get-relative-path.ts
var getRelativePath = (pathA, pathB)=>{
    let i = 0;
    for(; i < pathA.length && i < pathB.length; i++){
        if (pathA[i] !== pathB[i]) break;
    }
    return [
        (pathA.length - i).toString(),
        ...pathB.slice(i)
    ].join("/");
};
// src/zod-to-json-schema/parse-def.ts
function parseDef(def, refs, forceResolution = false) {
    var _a2;
    const seenItem = refs.seen.get(def);
    if (refs.override) {
        const overrideResult = (_a2 = refs.override) == null ? void 0 : _a2.call(refs, def, refs, seenItem, forceResolution);
        if (overrideResult !== ignoreOverride) {
            return overrideResult;
        }
    }
    if (seenItem && !forceResolution) {
        const seenSchema = get$ref(seenItem, refs);
        if (seenSchema !== void 0) {
            return seenSchema;
        }
    }
    const newItem = {
        def,
        path: refs.currentPath,
        jsonSchema: void 0
    };
    refs.seen.set(def, newItem);
    const jsonSchemaOrGetter = selectParser(def, def.typeName, refs);
    const jsonSchema2 = typeof jsonSchemaOrGetter === "function" ? parseDef(jsonSchemaOrGetter(), refs) : jsonSchemaOrGetter;
    if (jsonSchema2) {
        addMeta(def, refs, jsonSchema2);
    }
    if (refs.postProcess) {
        const postProcessResult = refs.postProcess(jsonSchema2, def, refs);
        newItem.jsonSchema = jsonSchema2;
        return postProcessResult;
    }
    newItem.jsonSchema = jsonSchema2;
    return jsonSchema2;
}
var get$ref = (item, refs)=>{
    switch(refs.$refStrategy){
        case "root":
            return {
                $ref: item.path.join("/")
            };
        case "relative":
            return {
                $ref: getRelativePath(refs.currentPath, item.path)
            };
        case "none":
        case "seen":
            {
                if (item.path.length < refs.currentPath.length && item.path.every((value, index)=>refs.currentPath[index] === value)) {
                    console.warn(`Recursive reference detected at ${refs.currentPath.join("/")}! Defaulting to any`);
                    return parseAnyDef();
                }
                return refs.$refStrategy === "seen" ? parseAnyDef() : void 0;
            }
    }
};
var addMeta = (def, refs, jsonSchema2)=>{
    if (def.description) {
        jsonSchema2.description = def.description;
    }
    return jsonSchema2;
};
// src/zod-to-json-schema/refs.ts
var getRefs = (options)=>{
    const _options = getDefaultOptions(options);
    const currentPath = _options.name !== void 0 ? [
        ..._options.basePath,
        _options.definitionPath,
        _options.name
    ] : _options.basePath;
    return {
        ..._options,
        currentPath,
        propertyPath: void 0,
        seen: new Map(Object.entries(_options.definitions).map(([name2, def])=>[
                def._def,
                {
                    def: def._def,
                    path: [
                        ..._options.basePath,
                        _options.definitionPath,
                        name2
                    ],
                    // Resolution of references will be forced even though seen, so it's ok that the schema is undefined here for now.
                    jsonSchema: void 0
                }
            ]))
    };
};
// src/zod-to-json-schema/zod-to-json-schema.ts
var zodToJsonSchema = (schema, options)=>{
    var _a2;
    const refs = getRefs(options);
    let definitions = typeof options === "object" && options.definitions ? Object.entries(options.definitions).reduce((acc, [name3, schema2])=>{
        var _a3;
        return {
            ...acc,
            [name3]: (_a3 = parseDef(schema2._def, {
                ...refs,
                currentPath: [
                    ...refs.basePath,
                    refs.definitionPath,
                    name3
                ]
            }, true)) != null ? _a3 : parseAnyDef()
        };
    }, {}) : void 0;
    const name2 = typeof options === "string" ? options : (options == null ? void 0 : options.nameStrategy) === "title" ? void 0 : options == null ? void 0 : options.name;
    const main = (_a2 = parseDef(schema._def, name2 === void 0 ? refs : {
        ...refs,
        currentPath: [
            ...refs.basePath,
            refs.definitionPath,
            name2
        ]
    }, false)) != null ? _a2 : parseAnyDef();
    const title = typeof options === "object" && options.name !== void 0 && options.nameStrategy === "title" ? options.name : void 0;
    if (title !== void 0) {
        main.title = title;
    }
    const combined = name2 === void 0 ? definitions ? {
        ...main,
        [refs.definitionPath]: definitions
    } : main : {
        $ref: [
            ...refs.$refStrategy === "relative" ? [] : refs.basePath,
            refs.definitionPath,
            name2
        ].join("/"),
        [refs.definitionPath]: {
            ...definitions,
            [name2]: main
        }
    };
    combined.$schema = "http://json-schema.org/draft-07/schema#";
    return combined;
};
// src/zod-to-json-schema/index.ts
var zod_to_json_schema_default = zodToJsonSchema;
// src/zod-schema.ts
function zod3Schema(zodSchema2, options) {
    var _a2;
    const useReferences = (_a2 = options == null ? void 0 : options.useReferences) != null ? _a2 : false;
    return jsonSchema(// defer json schema creation to avoid unnecessary computation when only validation is needed
    ()=>zod_to_json_schema_default(zodSchema2, {
            $refStrategy: useReferences ? "root" : "none"
        }), {
        validate: async (value)=>{
            const result = await zodSchema2.safeParseAsync(value);
            return result.success ? {
                success: true,
                value: result.data
            } : {
                success: false,
                error: result.error
            };
        }
    });
}
function zod4Schema(zodSchema2, options) {
    var _a2;
    const useReferences = (_a2 = options == null ? void 0 : options.useReferences) != null ? _a2 : false;
    return jsonSchema(// defer json schema creation to avoid unnecessary computation when only validation is needed
    ()=>addAdditionalPropertiesToJsonSchema(z4.toJSONSchema(zodSchema2, {
            target: "draft-7",
            io: "input",
            reused: useReferences ? "ref" : "inline"
        })), {
        validate: async (value)=>{
            const result = await z4.safeParseAsync(zodSchema2, value);
            return result.success ? {
                success: true,
                value: result.data
            } : {
                success: false,
                error: result.error
            };
        }
    });
}
function isZod4Schema(zodSchema2) {
    return "_zod" in zodSchema2;
}
function zodSchema(zodSchema2, options) {
    if (isZod4Schema(zodSchema2)) {
        return zod4Schema(zodSchema2, options);
    } else {
        return zod3Schema(zodSchema2, options);
    }
}
// src/as-schema.ts
function isSchema(value) {
    return typeof value === "object" && value !== null && schemaSymbol in value && value[schemaSymbol] === true && "jsonSchema" in value && "validate" in value;
}
function asSchema(schema) {
    return schema == null ? jsonSchema({
        properties: {},
        additionalProperties: false
    }) : isSchema(schema) ? schema : typeof schema === "function" ? schema() : zodSchema(schema);
}
// src/uint8-utils.ts
var { btoa, atob } = globalThis;
function convertBase64ToUint8Array(base64String) {
    const base64Url = base64String.replace(/-/g, "+").replace(/_/g, "/");
    const latin1string = atob(base64Url);
    return Uint8Array.from(latin1string, (byte)=>byte.codePointAt(0));
}
function convertUint8ArrayToBase64(array) {
    let latin1string = "";
    for(let i = 0; i < array.length; i++){
        latin1string += String.fromCodePoint(array[i]);
    }
    return btoa(latin1string);
}
function convertToBase64(value) {
    return value instanceof Uint8Array ? convertUint8ArrayToBase64(value) : value;
}
// src/validate-download-url.ts
function validateDownloadUrl(url) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch (e) {
        throw new DownloadError({
            url,
            message: `Invalid URL: ${url}`
        });
    }
    if (parsed.protocol === "data:") {
        return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new DownloadError({
            url,
            message: `URL scheme must be http, https, or data, got ${parsed.protocol}`
        });
    }
    const hostname = parsed.hostname;
    if (!hostname) {
        throw new DownloadError({
            url,
            message: `URL must have a hostname`
        });
    }
    if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".localhost")) {
        throw new DownloadError({
            url,
            message: `URL with hostname ${hostname} is not allowed`
        });
    }
    if (hostname.startsWith("[") && hostname.endsWith("]")) {
        const ipv6 = hostname.slice(1, -1);
        if (isPrivateIPv6(ipv6)) {
            throw new DownloadError({
                url,
                message: `URL with IPv6 address ${hostname} is not allowed`
            });
        }
        return;
    }
    if (isIPv4(hostname)) {
        if (isPrivateIPv4(hostname)) {
            throw new DownloadError({
                url,
                message: `URL with IP address ${hostname} is not allowed`
            });
        }
        return;
    }
}
function isIPv4(hostname) {
    const parts = hostname.split(".");
    if (parts.length !== 4) return false;
    return parts.every((part)=>{
        const num = Number(part);
        return Number.isInteger(num) && num >= 0 && num <= 255 && String(num) === part;
    });
}
function isPrivateIPv4(ip) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (a === 0) return true;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
}
function isPrivateIPv6(ip) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1") return true;
    if (normalized === "::") return true;
    if (normalized.startsWith("::ffff:")) {
        const mappedPart = normalized.slice(7);
        if (isIPv4(mappedPart)) {
            return isPrivateIPv4(mappedPart);
        }
        const hexParts = mappedPart.split(":");
        if (hexParts.length === 2) {
            const high = parseInt(hexParts[0], 16);
            const low = parseInt(hexParts[1], 16);
            if (!isNaN(high) && !isNaN(low)) {
                const a = high >> 8 & 255;
                const b = high & 255;
                const c = low >> 8 & 255;
                const d = low & 255;
                return isPrivateIPv4(`${a}.${b}.${c}.${d}`);
            }
        }
    }
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (normalized.startsWith("fe80")) return true;
    return false;
}
// src/without-trailing-slash.ts
function withoutTrailingSlash(url) {
    return url == null ? void 0 : url.replace(/\/$/, "");
}
// src/is-async-iterable.ts
function isAsyncIterable(obj) {
    return obj != null && typeof obj[Symbol.asyncIterator] === "function";
}
// src/types/execute-tool.ts
async function* executeTool({ execute, input, options }) {
    const result = execute(input, options);
    if (isAsyncIterable(result)) {
        let lastOutput;
        for await (const output of result){
            lastOutput = output;
            yield {
                type: "preliminary",
                output
            };
        }
        yield {
            type: "final",
            output: lastOutput
        };
    } else {
        yield {
            type: "final",
            output: await result
        };
    }
}
// src/index.ts
__reExport(index_exports, __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@standard-schema+spec@1.1.0/node_modules/@standard-schema/spec/dist/index.cjs [instrumentation] (ecmascript)"), module.exports);
var import_stream2 = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/eventsource-parser@3.0.8/node_modules/eventsource-parser/dist/stream.cjs [instrumentation] (ecmascript)");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
    DEFAULT_MAX_DOWNLOAD_SIZE,
    DelayedPromise,
    DownloadError,
    EventSourceParserStream,
    VERSION,
    asSchema,
    asValidator,
    combineHeaders,
    convertAsyncIteratorToReadableStream,
    convertBase64ToUint8Array,
    convertToBase64,
    convertUint8ArrayToBase64,
    createBinaryResponseHandler,
    createEventSourceResponseHandler,
    createIdGenerator,
    createJsonErrorResponseHandler,
    createJsonResponseHandler,
    createJsonStreamResponseHandler,
    createProviderDefinedToolFactory,
    createProviderDefinedToolFactoryWithOutputSchema,
    createStatusCodeErrorResponseHandler,
    delay,
    dynamicTool,
    executeTool,
    extractResponseHeaders,
    generateId,
    getErrorMessage,
    getFromApi,
    getRuntimeEnvironmentUserAgent,
    injectJsonInstructionIntoMessages,
    isAbortError,
    isParsableJson,
    isUrlSupported,
    isValidator,
    jsonSchema,
    lazySchema,
    lazyValidator,
    loadApiKey,
    loadOptionalSetting,
    loadSetting,
    mediaTypeToExtension,
    normalizeHeaders,
    parseJSON,
    parseJsonEventStream,
    parseProviderOptions,
    postFormDataToApi,
    postJsonToApi,
    postToApi,
    readResponseWithSizeLimit,
    removeUndefinedEntries,
    resolve,
    safeParseJSON,
    safeValidateTypes,
    standardSchemaValidator,
    tool,
    validateDownloadUrl,
    validateTypes,
    validator,
    withUserAgentSuffix,
    withoutTrailingSlash,
    zodSchema,
    ...__turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@standard-schema+spec@1.1.0/node_modules/@standard-schema/spec/dist/index.cjs [instrumentation] (ecmascript)")
}); //# sourceMappingURL=index.js.map
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@isaacs+ttlcache@2.1.4/node_modules/@isaacs/ttlcache/dist/commonjs/index.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

// A simple TTL cache with max capacity option, ms resolution,
// autopurge, and reasonably optimized performance
// Relies on the fact that integer Object keys are kept sorted,
// and managed very efficiently by V8.
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.TTLCache = void 0;
/* c8 ignore start */ const perf = typeof performance === 'object' && performance && typeof performance.now === 'function' ? performance : Date;
/* c8 ignore stop */ const now = ()=>perf.now();
const isPosInt = (n)=>!!n && n === Math.floor(n) && n > 0 && isFinite(n);
const isPosIntOrInf = (n)=>n === Infinity || isPosInt(n);
const TIMER_MAX = 2 ** 31 - 1;
class TTLCache {
    expirations = Object.create(null);
    data = new Map();
    expirationMap = new Map();
    ttl;
    max;
    updateAgeOnGet;
    updateAgeOnHas;
    noUpdateTTL;
    noDisposeOnSet;
    checkAgeOnGet;
    checkAgeOnHas;
    dispose;
    timer;
    timerExpiration;
    immortalKeys = new Set();
    constructor({ max = Infinity, ttl, updateAgeOnGet = false, checkAgeOnGet = false, updateAgeOnHas = false, checkAgeOnHas = false, noUpdateTTL = false, dispose, noDisposeOnSet = false } = {}){
        if (ttl !== undefined && !isPosIntOrInf(ttl)) {
            throw new TypeError('ttl must be positive integer or Infinity if set');
        }
        if (!isPosIntOrInf(max)) {
            throw new TypeError('max must be positive integer or Infinity');
        }
        this.ttl = ttl;
        this.max = max;
        this.updateAgeOnGet = !!updateAgeOnGet;
        this.checkAgeOnGet = !!checkAgeOnGet;
        this.updateAgeOnHas = !!updateAgeOnHas;
        this.checkAgeOnHas = !!checkAgeOnHas;
        this.noUpdateTTL = !!noUpdateTTL;
        this.noDisposeOnSet = !!noDisposeOnSet;
        if (dispose !== undefined) {
            if (typeof dispose !== 'function') {
                throw new TypeError('dispose must be function if set');
            }
            this.dispose = dispose;
        } else {
            this.dispose = (_, __, ___)=>{};
        }
        this.timer = undefined;
        this.timerExpiration = undefined;
    }
    setTimer(expiration, ttl) {
        if (this.timerExpiration && this.timerExpiration < expiration) {
            return;
        }
        if (this.timer) {
            clearTimeout(this.timer);
        }
        const t = setTimeout(()=>{
            this.timer = undefined;
            this.timerExpiration = undefined;
            this.purgeStale();
            for(const exp in this.expirations){
                const e = Number(exp);
                this.setTimer(e, e - now());
                break;
            }
        }, Math.min(TIMER_MAX, Math.max(0, ttl)));
        /* c8 ignore start - affordance for non-node envs */ if (t.unref) t.unref();
        /* c8 ignore stop */ this.timerExpiration = expiration;
        this.timer = t;
    }
    // hang onto the timer so we can clearTimeout if all items
    // are deleted.  Deno doesn't have Timer.unref(), so it
    // hangs otherwise.
    cancelTimer() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timerExpiration = undefined;
            this.timer = undefined;
        }
    }
    /* c8 ignore start */ cancelTimers() {
        process.emitWarning('TTLCache.cancelTimers has been renamed to ' + 'TTLCache.cancelTimer (no "s"), and will be removed in the next ' + 'major version update');
        return this.cancelTimer();
    }
    /* c8 ignore stop */ clear() {
        const entries = this.dispose !== TTLCache.prototype.dispose ? [
            ...this
        ] : [];
        this.data.clear();
        this.expirationMap.clear();
        // no need for any purging now
        this.cancelTimer();
        this.expirations = Object.create(null);
        for (const [key, val] of entries){
            this.dispose(val, key, 'delete');
        }
    }
    setTTL(key, ttl = this.ttl) {
        const current = this.expirationMap.get(key);
        if (current !== undefined) {
            // remove from the expirations list, so it isn't purged
            const exp = this.expirations[current];
            if (!exp || exp.length <= 1) {
                delete this.expirations[current];
            } else {
                this.expirations[current] = exp.filter((k)=>k !== key);
            }
        }
        if (ttl && ttl !== Infinity) {
            this.immortalKeys.delete(key);
            const expiration = Math.floor(now() + ttl);
            this.expirationMap.set(key, expiration);
            if (!this.expirations[expiration]) {
                this.expirations[expiration] = [];
                this.setTimer(expiration, ttl);
            }
            this.expirations[expiration].push(key);
        } else {
            this.immortalKeys.add(key);
            this.expirationMap.set(key, Infinity);
        }
    }
    set(key, val, { ttl = this.ttl, noUpdateTTL = this.noUpdateTTL, noDisposeOnSet = this.noDisposeOnSet } = {}) {
        if (!isPosIntOrInf(ttl)) {
            throw new TypeError('ttl must be positive integer or Infinity');
        }
        if (this.expirationMap.has(key)) {
            if (!noUpdateTTL) {
                this.setTTL(key, ttl);
            }
            // has old value
            const oldValue = this.data.get(key);
            const disp = !noDisposeOnSet && this.data.has(key);
            if (oldValue !== val) {
                this.data.set(key, val);
                if (disp) {
                    this.dispose(oldValue, key, 'set');
                }
            }
        } else {
            this.setTTL(key, ttl);
            this.data.set(key, val);
        }
        while(this.size > this.max){
            this.purgeToCapacity();
        }
        return this;
    }
    has(key, { checkAgeOnHas = this.checkAgeOnHas, ttl = this.ttl, updateAgeOnHas = this.updateAgeOnHas } = {}) {
        if (this.data.has(key)) {
            if (checkAgeOnHas && this.getRemainingTTL(key) === 0) {
                this.delete(key);
                return false;
            }
            if (updateAgeOnHas) {
                this.setTTL(key, ttl);
            }
            return true;
        }
        return false;
    }
    getRemainingTTL(key) {
        const expiration = this.expirationMap.get(key);
        return expiration === Infinity ? expiration : expiration !== undefined ? Math.max(0, Math.ceil(expiration - now())) : 0;
    }
    get(key, { updateAgeOnGet = this.updateAgeOnGet, ttl = this.ttl, checkAgeOnGet = this.checkAgeOnGet } = {}) {
        const val = this.data.get(key);
        if (checkAgeOnGet && this.getRemainingTTL(key) === 0) {
            this.delete(key);
            return undefined;
        }
        if (updateAgeOnGet) {
            this.setTTL(key, ttl);
        }
        return val;
    }
    delete(key) {
        const current = this.expirationMap.get(key);
        if (current !== undefined) {
            const value = this.data.get(key);
            this.data.delete(key);
            this.expirationMap.delete(key);
            this.immortalKeys.delete(key);
            const exp = this.expirations[current];
            if (exp) {
                if (exp.length <= 1) {
                    delete this.expirations[current];
                } else {
                    this.expirations[current] = exp.filter((k)=>k !== key);
                }
            }
            this.dispose(value, key, 'delete');
            if (this.size === 0) {
                this.cancelTimer();
            }
            return true;
        }
        return false;
    }
    purgeToCapacity() {
        for(const exp in this.expirations){
            const keys = this.expirations[exp];
            if (this.size - keys.length >= this.max) {
                delete this.expirations[exp];
                const entries = [];
                for (const key of keys){
                    entries.push([
                        key,
                        this.data.get(key)
                    ]);
                    this.data.delete(key);
                    this.expirationMap.delete(key);
                }
                for (const [key, val] of entries){
                    this.dispose(val, key, 'evict');
                }
            } else {
                const s = this.size - this.max;
                const entries = [];
                for (const key of keys.splice(0, s)){
                    entries.push([
                        key,
                        this.data.get(key)
                    ]);
                    this.data.delete(key);
                    this.expirationMap.delete(key);
                }
                for (const [key, val] of entries){
                    this.dispose(val, key, 'evict');
                }
                return;
            }
        }
    }
    get size() {
        return this.data.size;
    }
    purgeStale() {
        const n = Math.ceil(now());
        for(const exp in this.expirations){
            if (exp === 'Infinity' || Number(exp) > n) {
                return;
            }
            /* c8 ignore start
             * mysterious need for a guard here?
             * https://github.com/isaacs/ttlcache/issues/26 */ const keys = [
                ...this.expirations[exp] || []
            ];
            /* c8 ignore stop */ const entries = [];
            delete this.expirations[exp];
            for (const key of keys){
                entries.push([
                    key,
                    this.data.get(key)
                ]);
                this.data.delete(key);
                this.expirationMap.delete(key);
            }
            for (const [key, val] of entries){
                this.dispose(val, key, 'stale');
            }
        }
        if (this.size === 0) {
            this.cancelTimer();
        }
    }
    *entries() {
        for(const exp in this.expirations){
            for (const key of this.expirations[exp]){
                yield [
                    key,
                    this.data.get(key)
                ];
            }
        }
        for (const key of this.immortalKeys){
            yield [
                key,
                this.data.get(key)
            ];
        }
    }
    *keys() {
        for(const exp in this.expirations){
            for (const key of this.expirations[exp]){
                yield key;
            }
        }
        for (const key of this.immortalKeys){
            yield key;
        }
    }
    *values() {
        for(const exp in this.expirations){
            for (const key of this.expirations[exp]){
                yield this.data.get(key);
            }
        }
        for (const key of this.immortalKeys){
            yield this.data.get(key);
        }
    }
    [Symbol.iterator]() {
        return this.entries();
    }
}
exports.TTLCache = TTLCache; //# sourceMappingURL=index.js.map
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/bufferutil@4.1.0/node_modules/bufferutil/fallback.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

/**
 * Masks a buffer using the given mask.
 *
 * @param {Buffer} source The buffer to mask
 * @param {Buffer} mask The mask to use
 * @param {Buffer} output The buffer where to store the result
 * @param {Number} offset The offset at which to start writing
 * @param {Number} length The number of bytes to mask.
 * @public
 */ const mask = (source, mask, output, offset, length)=>{
    for(var i = 0; i < length; i++){
        output[offset + i] = source[i] ^ mask[i & 3];
    }
};
/**
 * Unmasks a buffer using the given mask.
 *
 * @param {Buffer} buffer The buffer to unmask
 * @param {Buffer} mask The mask to use
 * @public
 */ const unmask = (buffer, mask)=>{
    // Required until https://github.com/nodejs/node/issues/9006 is resolved.
    const length = buffer.length;
    for(var i = 0; i < length; i++){
        buffer[i] ^= mask[i & 3];
    }
};
module.exports = {
    mask,
    unmask
};
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/bufferutil@4.1.0/node_modules/bufferutil/index.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

try {
    module.exports = (()=>{
        const e = new Error("Cannot find module 'node-gyp-build'");
        e.code = 'MODULE_NOT_FOUND';
        throw e;
    })()(("TURBOPACK compile-time value", "/ROOT/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/bufferutil@4.1.0/node_modules/bufferutil"));
} catch (e) {
    module.exports = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/bufferutil@4.1.0/node_modules/bufferutil/fallback.js [instrumentation] (ecmascript)");
}
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/xxhash-wasm@1.1.0/node_modules/xxhash-wasm/cjs/xxhash-wasm.cjs [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

const t = new Uint8Array([
    0,
    97,
    115,
    109,
    1,
    0,
    0,
    0,
    1,
    48,
    8,
    96,
    3,
    127,
    127,
    127,
    1,
    127,
    96,
    3,
    127,
    127,
    127,
    0,
    96,
    2,
    127,
    127,
    0,
    96,
    1,
    127,
    1,
    127,
    96,
    3,
    127,
    127,
    126,
    1,
    126,
    96,
    3,
    126,
    127,
    127,
    1,
    126,
    96,
    2,
    127,
    126,
    0,
    96,
    1,
    127,
    1,
    126,
    3,
    11,
    10,
    0,
    0,
    2,
    1,
    3,
    4,
    5,
    6,
    1,
    7,
    5,
    3,
    1,
    0,
    1,
    7,
    85,
    9,
    3,
    109,
    101,
    109,
    2,
    0,
    5,
    120,
    120,
    104,
    51,
    50,
    0,
    0,
    6,
    105,
    110,
    105,
    116,
    51,
    50,
    0,
    2,
    8,
    117,
    112,
    100,
    97,
    116,
    101,
    51,
    50,
    0,
    3,
    8,
    100,
    105,
    103,
    101,
    115,
    116,
    51,
    50,
    0,
    4,
    5,
    120,
    120,
    104,
    54,
    52,
    0,
    5,
    6,
    105,
    110,
    105,
    116,
    54,
    52,
    0,
    7,
    8,
    117,
    112,
    100,
    97,
    116,
    101,
    54,
    52,
    0,
    8,
    8,
    100,
    105,
    103,
    101,
    115,
    116,
    54,
    52,
    0,
    9,
    10,
    251,
    22,
    10,
    242,
    1,
    1,
    4,
    127,
    32,
    0,
    32,
    1,
    106,
    33,
    3,
    32,
    1,
    65,
    16,
    79,
    4,
    127,
    32,
    3,
    65,
    16,
    107,
    33,
    6,
    32,
    2,
    65,
    168,
    136,
    141,
    161,
    2,
    106,
    33,
    3,
    32,
    2,
    65,
    137,
    235,
    208,
    208,
    7,
    107,
    33,
    4,
    32,
    2,
    65,
    207,
    140,
    162,
    142,
    6,
    106,
    33,
    5,
    3,
    64,
    32,
    3,
    32,
    0,
    40,
    2,
    0,
    65,
    247,
    148,
    175,
    175,
    120,
    108,
    106,
    65,
    13,
    119,
    65,
    177,
    243,
    221,
    241,
    121,
    108,
    33,
    3,
    32,
    4,
    32,
    0,
    65,
    4,
    106,
    34,
    0,
    40,
    2,
    0,
    65,
    247,
    148,
    175,
    175,
    120,
    108,
    106,
    65,
    13,
    119,
    65,
    177,
    243,
    221,
    241,
    121,
    108,
    33,
    4,
    32,
    2,
    32,
    0,
    65,
    4,
    106,
    34,
    0,
    40,
    2,
    0,
    65,
    247,
    148,
    175,
    175,
    120,
    108,
    106,
    65,
    13,
    119,
    65,
    177,
    243,
    221,
    241,
    121,
    108,
    33,
    2,
    32,
    5,
    32,
    0,
    65,
    4,
    106,
    34,
    0,
    40,
    2,
    0,
    65,
    247,
    148,
    175,
    175,
    120,
    108,
    106,
    65,
    13,
    119,
    65,
    177,
    243,
    221,
    241,
    121,
    108,
    33,
    5,
    32,
    6,
    32,
    0,
    65,
    4,
    106,
    34,
    0,
    79,
    13,
    0,
    11,
    32,
    2,
    65,
    12,
    119,
    32,
    5,
    65,
    18,
    119,
    106,
    32,
    4,
    65,
    7,
    119,
    106,
    32,
    3,
    65,
    1,
    119,
    106,
    5,
    32,
    2,
    65,
    177,
    207,
    217,
    178,
    1,
    106,
    11,
    32,
    1,
    106,
    32,
    0,
    32,
    1,
    65,
    15,
    113,
    16,
    1,
    11,
    146,
    1,
    0,
    32,
    1,
    32,
    2,
    106,
    33,
    2,
    3,
    64,
    32,
    1,
    65,
    4,
    106,
    32,
    2,
    75,
    69,
    4,
    64,
    32,
    0,
    32,
    1,
    40,
    2,
    0,
    65,
    189,
    220,
    202,
    149,
    124,
    108,
    106,
    65,
    17,
    119,
    65,
    175,
    214,
    211,
    190,
    2,
    108,
    33,
    0,
    32,
    1,
    65,
    4,
    106,
    33,
    1,
    12,
    1,
    11,
    11,
    3,
    64,
    32,
    1,
    32,
    2,
    79,
    69,
    4,
    64,
    32,
    0,
    32,
    1,
    45,
    0,
    0,
    65,
    177,
    207,
    217,
    178,
    1,
    108,
    106,
    65,
    11,
    119,
    65,
    177,
    243,
    221,
    241,
    121,
    108,
    33,
    0,
    32,
    1,
    65,
    1,
    106,
    33,
    1,
    12,
    1,
    11,
    11,
    32,
    0,
    32,
    0,
    65,
    15,
    118,
    115,
    65,
    247,
    148,
    175,
    175,
    120,
    108,
    34,
    0,
    65,
    13,
    118,
    32,
    0,
    115,
    65,
    189,
    220,
    202,
    149,
    124,
    108,
    34,
    0,
    65,
    16,
    118,
    32,
    0,
    115,
    11,
    63,
    0,
    32,
    0,
    65,
    8,
    106,
    32,
    1,
    65,
    168,
    136,
    141,
    161,
    2,
    106,
    54,
    2,
    0,
    32,
    0,
    65,
    12,
    106,
    32,
    1,
    65,
    137,
    235,
    208,
    208,
    7,
    107,
    54,
    2,
    0,
    32,
    0,
    65,
    16,
    106,
    32,
    1,
    54,
    2,
    0,
    32,
    0,
    65,
    20,
    106,
    32,
    1,
    65,
    207,
    140,
    162,
    142,
    6,
    106,
    54,
    2,
    0,
    11,
    195,
    4,
    1,
    6,
    127,
    32,
    1,
    32,
    2,
    106,
    33,
    6,
    32,
    0,
    65,
    24,
    106,
    33,
    4,
    32,
    0,
    65,
    40,
    106,
    40,
    2,
    0,
    33,
    3,
    32,
    0,
    32,
    0,
    40,
    2,
    0,
    32,
    2,
    106,
    54,
    2,
    0,
    32,
    0,
    65,
    4,
    106,
    34,
    5,
    32,
    5,
    40,
    2,
    0,
    32,
    2,
    65,
    16,
    79,
    32,
    0,
    40,
    2,
    0,
    65,
    16,
    79,
    114,
    114,
    54,
    2,
    0,
    32,
    2,
    32,
    3,
    106,
    65,
    16,
    73,
    4,
    64,
    32,
    3,
    32,
    4,
    106,
    32,
    1,
    32,
    2,
    252,
    10,
    0,
    0,
    32,
    0,
    65,
    40,
    106,
    32,
    2,
    32,
    3,
    106,
    54,
    2,
    0,
    15,
    11,
    32,
    3,
    4,
    64,
    32,
    3,
    32,
    4,
    106,
    32,
    1,
    65,
    16,
    32,
    3,
    107,
    34,
    2,
    252,
    10,
    0,
    0,
    32,
    0,
    65,
    8,
    106,
    34,
    3,
    32,
    3,
    40,
    2,
    0,
    32,
    4,
    40,
    2,
    0,
    65,
    247,
    148,
    175,
    175,
    120,
    108,
    106,
    65,
    13,
    119,
    65,
    177,
    243,
    221,
    241,
    121,
    108,
    54,
    2,
    0,
    32,
    0,
    65,
    12,
    106,
    34,
    3,
    32,
    3,
    40,
    2,
    0,
    32,
    4,
    65,
    4,
    106,
    40,
    2,
    0,
    65,
    247,
    148,
    175,
    175,
    120,
    108,
    106,
    65,
    13,
    119,
    65,
    177,
    243,
    221,
    241,
    121,
    108,
    54,
    2,
    0,
    32,
    0,
    65,
    16,
    106,
    34,
    3,
    32,
    3,
    40,
    2,
    0,
    32,
    4,
    65,
    8,
    106,
    40,
    2,
    0,
    65,
    247,
    148,
    175,
    175,
    120,
    108,
    106,
    65,
    13,
    119,
    65,
    177,
    243,
    221,
    241,
    121,
    108,
    54,
    2,
    0,
    32,
    0,
    65,
    20,
    106,
    34,
    3,
    32,
    3,
    40,
    2,
    0,
    32,
    4,
    65,
    12,
    106,
    40,
    2,
    0,
    65,
    247,
    148,
    175,
    175,
    120,
    108,
    106,
    65,
    13,
    119,
    65,
    177,
    243,
    221,
    241,
    121,
    108,
    54,
    2,
    0,
    32,
    0,
    65,
    40,
    106,
    65,
    0,
    54,
    2,
    0,
    32,
    1,
    32,
    2,
    106,
    33,
    1,
    11,
    32,
    1,
    32,
    6,
    65,
    16,
    107,
    77,
    4,
    64,
    32,
    6,
    65,
    16,
    107,
    33,
    8,
    32,
    0,
    65,
    8,
    106,
    40,
    2,
    0,
    33,
    2,
    32,
    0,
    65,
    12,
    106,
    40,
    2,
    0,
    33,
    3,
    32,
    0,
    65,
    16,
    106,
    40,
    2,
    0,
    33,
    5,
    32,
    0,
    65,
    20,
    106,
    40,
    2,
    0,
    33,
    7,
    3,
    64,
    32,
    2,
    32,
    1,
    40,
    2,
    0,
    65,
    247,
    148,
    175,
    175,
    120,
    108,
    106,
    65,
    13,
    119,
    65,
    177,
    243,
    221,
    241,
    121,
    108,
    33,
    2,
    32,
    3,
    32,
    1,
    65,
    4,
    106,
    34,
    1,
    40,
    2,
    0,
    65,
    247,
    148,
    175,
    175,
    120,
    108,
    106,
    65,
    13,
    119,
    65,
    177,
    243,
    221,
    241,
    121,
    108,
    33,
    3,
    32,
    5,
    32,
    1,
    65,
    4,
    106,
    34,
    1,
    40,
    2,
    0,
    65,
    247,
    148,
    175,
    175,
    120,
    108,
    106,
    65,
    13,
    119,
    65,
    177,
    243,
    221,
    241,
    121,
    108,
    33,
    5,
    32,
    7,
    32,
    1,
    65,
    4,
    106,
    34,
    1,
    40,
    2,
    0,
    65,
    247,
    148,
    175,
    175,
    120,
    108,
    106,
    65,
    13,
    119,
    65,
    177,
    243,
    221,
    241,
    121,
    108,
    33,
    7,
    32,
    8,
    32,
    1,
    65,
    4,
    106,
    34,
    1,
    79,
    13,
    0,
    11,
    32,
    0,
    65,
    8,
    106,
    32,
    2,
    54,
    2,
    0,
    32,
    0,
    65,
    12,
    106,
    32,
    3,
    54,
    2,
    0,
    32,
    0,
    65,
    16,
    106,
    32,
    5,
    54,
    2,
    0,
    32,
    0,
    65,
    20,
    106,
    32,
    7,
    54,
    2,
    0,
    11,
    32,
    1,
    32,
    6,
    73,
    4,
    64,
    32,
    4,
    32,
    1,
    32,
    6,
    32,
    1,
    107,
    34,
    1,
    252,
    10,
    0,
    0,
    32,
    0,
    65,
    40,
    106,
    32,
    1,
    54,
    2,
    0,
    11,
    11,
    97,
    1,
    1,
    127,
    32,
    0,
    65,
    16,
    106,
    40,
    2,
    0,
    33,
    1,
    32,
    0,
    65,
    4,
    106,
    40,
    2,
    0,
    4,
    127,
    32,
    1,
    65,
    12,
    119,
    32,
    0,
    65,
    20,
    106,
    40,
    2,
    0,
    65,
    18,
    119,
    106,
    32,
    0,
    65,
    12,
    106,
    40,
    2,
    0,
    65,
    7,
    119,
    106,
    32,
    0,
    65,
    8,
    106,
    40,
    2,
    0,
    65,
    1,
    119,
    106,
    5,
    32,
    1,
    65,
    177,
    207,
    217,
    178,
    1,
    106,
    11,
    32,
    0,
    40,
    2,
    0,
    106,
    32,
    0,
    65,
    24,
    106,
    32,
    0,
    65,
    40,
    106,
    40,
    2,
    0,
    16,
    1,
    11,
    255,
    3,
    2,
    3,
    126,
    1,
    127,
    32,
    0,
    32,
    1,
    106,
    33,
    6,
    32,
    1,
    65,
    32,
    79,
    4,
    126,
    32,
    6,
    65,
    32,
    107,
    33,
    6,
    32,
    2,
    66,
    214,
    235,
    130,
    238,
    234,
    253,
    137,
    245,
    224,
    0,
    124,
    33,
    3,
    32,
    2,
    66,
    177,
    169,
    172,
    193,
    173,
    184,
    212,
    166,
    61,
    125,
    33,
    4,
    32,
    2,
    66,
    249,
    234,
    208,
    208,
    231,
    201,
    161,
    228,
    225,
    0,
    124,
    33,
    5,
    3,
    64,
    32,
    3,
    32,
    0,
    41,
    3,
    0,
    66,
    207,
    214,
    211,
    190,
    210,
    199,
    171,
    217,
    66,
    126,
    124,
    66,
    31,
    137,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    33,
    3,
    32,
    4,
    32,
    0,
    65,
    8,
    106,
    34,
    0,
    41,
    3,
    0,
    66,
    207,
    214,
    211,
    190,
    210,
    199,
    171,
    217,
    66,
    126,
    124,
    66,
    31,
    137,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    33,
    4,
    32,
    2,
    32,
    0,
    65,
    8,
    106,
    34,
    0,
    41,
    3,
    0,
    66,
    207,
    214,
    211,
    190,
    210,
    199,
    171,
    217,
    66,
    126,
    124,
    66,
    31,
    137,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    33,
    2,
    32,
    5,
    32,
    0,
    65,
    8,
    106,
    34,
    0,
    41,
    3,
    0,
    66,
    207,
    214,
    211,
    190,
    210,
    199,
    171,
    217,
    66,
    126,
    124,
    66,
    31,
    137,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    33,
    5,
    32,
    6,
    32,
    0,
    65,
    8,
    106,
    34,
    0,
    79,
    13,
    0,
    11,
    32,
    2,
    66,
    12,
    137,
    32,
    5,
    66,
    18,
    137,
    124,
    32,
    4,
    66,
    7,
    137,
    124,
    32,
    3,
    66,
    1,
    137,
    124,
    32,
    3,
    66,
    207,
    214,
    211,
    190,
    210,
    199,
    171,
    217,
    66,
    126,
    66,
    31,
    137,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    133,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    66,
    157,
    163,
    181,
    234,
    131,
    177,
    141,
    138,
    250,
    0,
    125,
    32,
    4,
    66,
    207,
    214,
    211,
    190,
    210,
    199,
    171,
    217,
    66,
    126,
    66,
    31,
    137,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    133,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    66,
    157,
    163,
    181,
    234,
    131,
    177,
    141,
    138,
    250,
    0,
    125,
    32,
    2,
    66,
    207,
    214,
    211,
    190,
    210,
    199,
    171,
    217,
    66,
    126,
    66,
    31,
    137,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    133,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    66,
    157,
    163,
    181,
    234,
    131,
    177,
    141,
    138,
    250,
    0,
    125,
    32,
    5,
    66,
    207,
    214,
    211,
    190,
    210,
    199,
    171,
    217,
    66,
    126,
    66,
    31,
    137,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    133,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    66,
    157,
    163,
    181,
    234,
    131,
    177,
    141,
    138,
    250,
    0,
    125,
    5,
    32,
    2,
    66,
    197,
    207,
    217,
    178,
    241,
    229,
    186,
    234,
    39,
    124,
    11,
    32,
    1,
    173,
    124,
    32,
    0,
    32,
    1,
    65,
    31,
    113,
    16,
    6,
    11,
    134,
    2,
    0,
    32,
    1,
    32,
    2,
    106,
    33,
    2,
    3,
    64,
    32,
    2,
    32,
    1,
    65,
    8,
    106,
    79,
    4,
    64,
    32,
    1,
    41,
    3,
    0,
    66,
    207,
    214,
    211,
    190,
    210,
    199,
    171,
    217,
    66,
    126,
    66,
    31,
    137,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    32,
    0,
    133,
    66,
    27,
    137,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    66,
    157,
    163,
    181,
    234,
    131,
    177,
    141,
    138,
    250,
    0,
    125,
    33,
    0,
    32,
    1,
    65,
    8,
    106,
    33,
    1,
    12,
    1,
    11,
    11,
    32,
    1,
    65,
    4,
    106,
    32,
    2,
    77,
    4,
    64,
    32,
    0,
    32,
    1,
    53,
    2,
    0,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    133,
    66,
    23,
    137,
    66,
    207,
    214,
    211,
    190,
    210,
    199,
    171,
    217,
    66,
    126,
    66,
    249,
    243,
    221,
    241,
    153,
    246,
    153,
    171,
    22,
    124,
    33,
    0,
    32,
    1,
    65,
    4,
    106,
    33,
    1,
    11,
    3,
    64,
    32,
    1,
    32,
    2,
    73,
    4,
    64,
    32,
    0,
    32,
    1,
    49,
    0,
    0,
    66,
    197,
    207,
    217,
    178,
    241,
    229,
    186,
    234,
    39,
    126,
    133,
    66,
    11,
    137,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    33,
    0,
    32,
    1,
    65,
    1,
    106,
    33,
    1,
    12,
    1,
    11,
    11,
    32,
    0,
    32,
    0,
    66,
    33,
    136,
    133,
    66,
    207,
    214,
    211,
    190,
    210,
    199,
    171,
    217,
    66,
    126,
    34,
    0,
    32,
    0,
    66,
    29,
    136,
    133,
    66,
    249,
    243,
    221,
    241,
    153,
    246,
    153,
    171,
    22,
    126,
    34,
    0,
    32,
    0,
    66,
    32,
    136,
    133,
    11,
    77,
    0,
    32,
    0,
    65,
    8,
    106,
    32,
    1,
    66,
    214,
    235,
    130,
    238,
    234,
    253,
    137,
    245,
    224,
    0,
    124,
    55,
    3,
    0,
    32,
    0,
    65,
    16,
    106,
    32,
    1,
    66,
    177,
    169,
    172,
    193,
    173,
    184,
    212,
    166,
    61,
    125,
    55,
    3,
    0,
    32,
    0,
    65,
    24,
    106,
    32,
    1,
    55,
    3,
    0,
    32,
    0,
    65,
    32,
    106,
    32,
    1,
    66,
    249,
    234,
    208,
    208,
    231,
    201,
    161,
    228,
    225,
    0,
    124,
    55,
    3,
    0,
    11,
    244,
    4,
    2,
    3,
    127,
    4,
    126,
    32,
    1,
    32,
    2,
    106,
    33,
    5,
    32,
    0,
    65,
    40,
    106,
    33,
    4,
    32,
    0,
    65,
    200,
    0,
    106,
    40,
    2,
    0,
    33,
    3,
    32,
    0,
    32,
    0,
    41,
    3,
    0,
    32,
    2,
    173,
    124,
    55,
    3,
    0,
    32,
    2,
    32,
    3,
    106,
    65,
    32,
    73,
    4,
    64,
    32,
    3,
    32,
    4,
    106,
    32,
    1,
    32,
    2,
    252,
    10,
    0,
    0,
    32,
    0,
    65,
    200,
    0,
    106,
    32,
    2,
    32,
    3,
    106,
    54,
    2,
    0,
    15,
    11,
    32,
    3,
    4,
    64,
    32,
    3,
    32,
    4,
    106,
    32,
    1,
    65,
    32,
    32,
    3,
    107,
    34,
    2,
    252,
    10,
    0,
    0,
    32,
    0,
    65,
    8,
    106,
    34,
    3,
    32,
    3,
    41,
    3,
    0,
    32,
    4,
    41,
    3,
    0,
    66,
    207,
    214,
    211,
    190,
    210,
    199,
    171,
    217,
    66,
    126,
    124,
    66,
    31,
    137,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    55,
    3,
    0,
    32,
    0,
    65,
    16,
    106,
    34,
    3,
    32,
    3,
    41,
    3,
    0,
    32,
    4,
    65,
    8,
    106,
    41,
    3,
    0,
    66,
    207,
    214,
    211,
    190,
    210,
    199,
    171,
    217,
    66,
    126,
    124,
    66,
    31,
    137,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    55,
    3,
    0,
    32,
    0,
    65,
    24,
    106,
    34,
    3,
    32,
    3,
    41,
    3,
    0,
    32,
    4,
    65,
    16,
    106,
    41,
    3,
    0,
    66,
    207,
    214,
    211,
    190,
    210,
    199,
    171,
    217,
    66,
    126,
    124,
    66,
    31,
    137,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    55,
    3,
    0,
    32,
    0,
    65,
    32,
    106,
    34,
    3,
    32,
    3,
    41,
    3,
    0,
    32,
    4,
    65,
    24,
    106,
    41,
    3,
    0,
    66,
    207,
    214,
    211,
    190,
    210,
    199,
    171,
    217,
    66,
    126,
    124,
    66,
    31,
    137,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    55,
    3,
    0,
    32,
    0,
    65,
    200,
    0,
    106,
    65,
    0,
    54,
    2,
    0,
    32,
    1,
    32,
    2,
    106,
    33,
    1,
    11,
    32,
    1,
    65,
    32,
    106,
    32,
    5,
    77,
    4,
    64,
    32,
    5,
    65,
    32,
    107,
    33,
    2,
    32,
    0,
    65,
    8,
    106,
    41,
    3,
    0,
    33,
    6,
    32,
    0,
    65,
    16,
    106,
    41,
    3,
    0,
    33,
    7,
    32,
    0,
    65,
    24,
    106,
    41,
    3,
    0,
    33,
    8,
    32,
    0,
    65,
    32,
    106,
    41,
    3,
    0,
    33,
    9,
    3,
    64,
    32,
    6,
    32,
    1,
    41,
    3,
    0,
    66,
    207,
    214,
    211,
    190,
    210,
    199,
    171,
    217,
    66,
    126,
    124,
    66,
    31,
    137,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    33,
    6,
    32,
    7,
    32,
    1,
    65,
    8,
    106,
    34,
    1,
    41,
    3,
    0,
    66,
    207,
    214,
    211,
    190,
    210,
    199,
    171,
    217,
    66,
    126,
    124,
    66,
    31,
    137,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    33,
    7,
    32,
    8,
    32,
    1,
    65,
    8,
    106,
    34,
    1,
    41,
    3,
    0,
    66,
    207,
    214,
    211,
    190,
    210,
    199,
    171,
    217,
    66,
    126,
    124,
    66,
    31,
    137,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    33,
    8,
    32,
    9,
    32,
    1,
    65,
    8,
    106,
    34,
    1,
    41,
    3,
    0,
    66,
    207,
    214,
    211,
    190,
    210,
    199,
    171,
    217,
    66,
    126,
    124,
    66,
    31,
    137,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    33,
    9,
    32,
    2,
    32,
    1,
    65,
    8,
    106,
    34,
    1,
    79,
    13,
    0,
    11,
    32,
    0,
    65,
    8,
    106,
    32,
    6,
    55,
    3,
    0,
    32,
    0,
    65,
    16,
    106,
    32,
    7,
    55,
    3,
    0,
    32,
    0,
    65,
    24,
    106,
    32,
    8,
    55,
    3,
    0,
    32,
    0,
    65,
    32,
    106,
    32,
    9,
    55,
    3,
    0,
    11,
    32,
    1,
    32,
    5,
    73,
    4,
    64,
    32,
    4,
    32,
    1,
    32,
    5,
    32,
    1,
    107,
    34,
    1,
    252,
    10,
    0,
    0,
    32,
    0,
    65,
    200,
    0,
    106,
    32,
    1,
    54,
    2,
    0,
    11,
    11,
    188,
    2,
    1,
    5,
    126,
    32,
    0,
    65,
    24,
    106,
    41,
    3,
    0,
    33,
    1,
    32,
    0,
    41,
    3,
    0,
    34,
    2,
    66,
    32,
    90,
    4,
    126,
    32,
    0,
    65,
    8,
    106,
    41,
    3,
    0,
    34,
    3,
    66,
    1,
    137,
    32,
    0,
    65,
    16,
    106,
    41,
    3,
    0,
    34,
    4,
    66,
    7,
    137,
    124,
    32,
    1,
    66,
    12,
    137,
    32,
    0,
    65,
    32,
    106,
    41,
    3,
    0,
    34,
    5,
    66,
    18,
    137,
    124,
    124,
    32,
    3,
    66,
    207,
    214,
    211,
    190,
    210,
    199,
    171,
    217,
    66,
    126,
    66,
    31,
    137,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    133,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    66,
    157,
    163,
    181,
    234,
    131,
    177,
    141,
    138,
    250,
    0,
    125,
    32,
    4,
    66,
    207,
    214,
    211,
    190,
    210,
    199,
    171,
    217,
    66,
    126,
    66,
    31,
    137,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    133,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    66,
    157,
    163,
    181,
    234,
    131,
    177,
    141,
    138,
    250,
    0,
    125,
    32,
    1,
    66,
    207,
    214,
    211,
    190,
    210,
    199,
    171,
    217,
    66,
    126,
    66,
    31,
    137,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    133,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    66,
    157,
    163,
    181,
    234,
    131,
    177,
    141,
    138,
    250,
    0,
    125,
    32,
    5,
    66,
    207,
    214,
    211,
    190,
    210,
    199,
    171,
    217,
    66,
    126,
    66,
    31,
    137,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    133,
    66,
    135,
    149,
    175,
    175,
    152,
    182,
    222,
    155,
    158,
    127,
    126,
    66,
    157,
    163,
    181,
    234,
    131,
    177,
    141,
    138,
    250,
    0,
    125,
    5,
    32,
    1,
    66,
    197,
    207,
    217,
    178,
    241,
    229,
    186,
    234,
    39,
    124,
    11,
    32,
    2,
    124,
    32,
    0,
    65,
    40,
    106,
    32,
    2,
    66,
    31,
    131,
    167,
    16,
    6,
    11
]);
async function e() {
    return function(t) {
        const { exports: { mem: e, xxh32: n, xxh64: r, init32: i, update32: s, digest32: o, init64: a, update64: u, digest64: c } } = t;
        let h = new Uint8Array(e.buffer);
        function g(t, n) {
            if (e.buffer.byteLength < t + n) {
                const r = Math.ceil((t + n - e.buffer.byteLength) / 65536);
                e.grow(r), h = new Uint8Array(e.buffer);
            }
        }
        function f(t, e, n, r, i, s) {
            g(t);
            const o = new Uint8Array(t);
            return h.set(o), n(0, e), o.set(h.subarray(0, t)), {
                update (e) {
                    let n;
                    return h.set(o), "string" == typeof e ? (g(3 * e.length, t), n = w.encodeInto(e, h.subarray(t)).written) : (g(e.byteLength, t), h.set(e, t), n = e.byteLength), r(0, t, n), o.set(h.subarray(0, t)), this;
                },
                digest: ()=>(h.set(o), s(i(0)))
            };
        }
        function y(t) {
            return t >>> 0;
        }
        const b = 2n ** 64n - 1n;
        function d(t) {
            return t & b;
        }
        const w = new TextEncoder, l = 0, p = 0n;
        function L(t, e = l) {
            return g(3 * t.length, 0), y(n(0, w.encodeInto(t, h).written, e));
        }
        function x(t, e = p) {
            return g(3 * t.length, 0), d(r(0, w.encodeInto(t, h).written, e));
        }
        return {
            h32: L,
            h32ToString: (t, e = l)=>L(t, e).toString(16).padStart(8, "0"),
            h32Raw: (t, e = l)=>(g(t.byteLength, 0), h.set(t), y(n(0, t.byteLength, e))),
            create32: (t = l)=>f(48, t, i, s, o, y),
            h64: x,
            h64ToString: (t, e = p)=>x(t, e).toString(16).padStart(16, "0"),
            h64Raw: (t, e = p)=>(g(t.byteLength, 0), h.set(t), d(r(0, t.byteLength, e))),
            create64: (t = p)=>f(88, t, a, u, c, d)
        };
    }((await WebAssembly.instantiate(t)).instance);
}
module.exports = e; //# sourceMappingURL=xxhash-wasm.cjs.map
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/lru-cache@11.4.0/node_modules/lru-cache/dist/commonjs/node/index.min.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var M = (c, t)=>()=>(t || c((t = {
            exports: {}
        }).exports, t), t.exports);
var U = M((O)=>{
    "use strict";
    Object.defineProperty(O, "__esModule", {
        value: !0
    });
    O.tracing = O.metrics = void 0;
    var j = __turbopack_context__.r("[externals]/node:diagnostics_channel [external] (node:diagnostics_channel, cjs)");
    O.metrics = (0, j.channel)("lru-cache:metrics");
    O.tracing = (0, j.tracingChannel)("lru-cache");
});
var I = M((R)=>{
    "use strict";
    Object.defineProperty(R, "__esModule", {
        value: !0
    });
    R.defaultPerf = void 0;
    R.defaultPerf = typeof performance == "object" && performance && typeof performance.now == "function" ? performance : Date;
});
Object.defineProperty(exports, "__esModule", {
    value: !0
});
exports.LRUCache = void 0;
var d = U(), N = I(), C = ()=>d.metrics.hasSubscribers || d.tracing.hasSubscribers, G = new Set, P = typeof process == "object" && process ? process : {}, V = (c, t, e, i)=>{
    typeof P.emitWarning == "function" ? P.emitWarning(c, t, e, i) : console.error(`[${e}] ${t}: ${c}`);
}, q = (c)=>!G.has(c);
var T = (c)=>!!c && c === Math.floor(c) && c > 0 && isFinite(c), H = (c)=>T(c) ? c <= Math.pow(2, 8) ? Uint8Array : c <= Math.pow(2, 16) ? Uint16Array : c <= Math.pow(2, 32) ? Uint32Array : c <= Number.MAX_SAFE_INTEGER ? W : null : null, W = class extends Array {
    constructor(t){
        super(t), this.fill(0);
    }
}, x = class c {
    heap;
    length;
    static #o = !1;
    static create(t) {
        let e = H(t);
        if (!e) return [];
        c.#o = !0;
        let i = new c(t, e);
        return c.#o = !1, i;
    }
    constructor(t, e){
        if (!c.#o) throw new TypeError("instantiate Stack using Stack.create(n)");
        this.heap = new e(t), this.length = 0;
    }
    push(t) {
        this.heap[this.length++] = t;
    }
    pop() {
        return this.heap[--this.length];
    }
}, L = class c {
    #o;
    #c;
    #m;
    #W;
    #w;
    #M;
    #j;
    #S;
    get perf() {
        return this.#S;
    }
    ttl;
    ttlResolution;
    ttlAutopurge;
    updateAgeOnGet;
    updateAgeOnHas;
    allowStale;
    noDisposeOnSet;
    noUpdateTTL;
    maxEntrySize;
    sizeCalculation;
    noDeleteOnFetchRejection;
    noDeleteOnStaleGet;
    allowStaleOnFetchAbort;
    allowStaleOnFetchRejection;
    ignoreFetchAbort;
    #n;
    #b;
    #s;
    #i;
    #t;
    #l;
    #u;
    #a;
    #h;
    #_;
    #r;
    #y;
    #F;
    #d;
    #g;
    #T;
    #U;
    #f;
    #D;
    static unsafeExposeInternals(t) {
        return {
            starts: t.#F,
            ttls: t.#d,
            autopurgeTimers: t.#g,
            sizes: t.#y,
            keyMap: t.#s,
            keyList: t.#i,
            valList: t.#t,
            next: t.#l,
            prev: t.#u,
            get head () {
                return t.#a;
            },
            get tail () {
                return t.#h;
            },
            free: t.#_,
            isBackgroundFetch: (e)=>t.#e(e),
            backgroundFetch: (e, i, s, n)=>t.#G(e, i, s, n),
            moveToTail: (e)=>t.#L(e),
            indexes: (e)=>t.#A(e),
            rindexes: (e)=>t.#v(e),
            isStale: (e)=>t.#p(e)
        };
    }
    get max() {
        return this.#o;
    }
    get maxSize() {
        return this.#c;
    }
    get calculatedSize() {
        return this.#b;
    }
    get size() {
        return this.#n;
    }
    get fetchMethod() {
        return this.#M;
    }
    get memoMethod() {
        return this.#j;
    }
    get dispose() {
        return this.#m;
    }
    get onInsert() {
        return this.#W;
    }
    get disposeAfter() {
        return this.#w;
    }
    constructor(t){
        let { max: e = 0, ttl: i, ttlResolution: s = 1, ttlAutopurge: n, updateAgeOnGet: r, updateAgeOnHas: h, allowStale: a, dispose: o, onInsert: m, disposeAfter: S, noDisposeOnSet: y, noUpdateTTL: u, maxSize: g = 0, maxEntrySize: f = 0, sizeCalculation: _, fetchMethod: l, memoMethod: w, noDeleteOnFetchRejection: F, noDeleteOnStaleGet: b, allowStaleOnFetchRejection: p, allowStaleOnFetchAbort: A, ignoreFetchAbort: v, perf: D } = t;
        if (D !== void 0 && typeof D?.now != "function") throw new TypeError("perf option must have a now() method if specified");
        if (this.#S = D ?? N.defaultPerf, e !== 0 && !T(e)) throw new TypeError("max option must be a nonnegative integer");
        let z = e ? H(e) : Array;
        if (!z) throw new Error("invalid max value: " + e);
        if (this.#o = e, this.#c = g, this.maxEntrySize = f || this.#c, this.sizeCalculation = _, this.sizeCalculation) {
            if (!this.#c && !this.maxEntrySize) throw new TypeError("cannot set sizeCalculation without setting maxSize or maxEntrySize");
            if (typeof this.sizeCalculation != "function") throw new TypeError("sizeCalculation set to non-function");
        }
        if (w !== void 0 && typeof w != "function") throw new TypeError("memoMethod must be a function if defined");
        if (this.#j = w, l !== void 0 && typeof l != "function") throw new TypeError("fetchMethod must be a function if specified");
        if (this.#M = l, this.#U = !!l, this.#s = new Map, this.#i = Array.from({
            length: e
        }).fill(void 0), this.#t = Array.from({
            length: e
        }).fill(void 0), this.#l = new z(e), this.#u = new z(e), this.#a = 0, this.#h = 0, this.#_ = x.create(e), this.#n = 0, this.#b = 0, typeof o == "function" && (this.#m = o), typeof m == "function" && (this.#W = m), typeof S == "function" ? (this.#w = S, this.#r = []) : (this.#w = void 0, this.#r = void 0), this.#T = !!this.#m, this.#D = !!this.#W, this.#f = !!this.#w, this.noDisposeOnSet = !!y, this.noUpdateTTL = !!u, this.noDeleteOnFetchRejection = !!F, this.allowStaleOnFetchRejection = !!p, this.allowStaleOnFetchAbort = !!A, this.ignoreFetchAbort = !!v, this.maxEntrySize !== 0) {
            if (this.#c !== 0 && !T(this.#c)) throw new TypeError("maxSize must be a positive integer if specified");
            if (!T(this.maxEntrySize)) throw new TypeError("maxEntrySize must be a positive integer if specified");
            this.#X();
        }
        if (this.allowStale = !!a, this.noDeleteOnStaleGet = !!b, this.updateAgeOnGet = !!r, this.updateAgeOnHas = !!h, this.ttlResolution = T(s) || s === 0 ? s : 1, this.ttlAutopurge = !!n, this.ttl = i || 0, this.ttl) {
            if (!T(this.ttl)) throw new TypeError("ttl must be a positive integer if specified");
            this.#H();
        }
        if (this.#o === 0 && this.ttl === 0 && this.#c === 0) throw new TypeError("At least one of max, maxSize, or ttl is required");
        if (!this.ttlAutopurge && !this.#o && !this.#c) {
            let E = "LRU_CACHE_UNBOUNDED";
            q(E) && (G.add(E), V("TTL caching without ttlAutopurge, max, or maxSize can result in unbounded memory consumption.", "UnboundedCacheWarning", E, c));
        }
    }
    getRemainingTTL(t) {
        return this.#s.has(t) ? 1 / 0 : 0;
    }
    #H() {
        let t = new W(this.#o), e = new W(this.#o);
        this.#d = t, this.#F = e;
        let i = this.ttlAutopurge ? Array.from({
            length: this.#o
        }) : void 0;
        this.#g = i, this.#N = (h, a, o = this.#S.now())=>{
            e[h] = a !== 0 ? o : 0, t[h] = a, s(h, a);
        }, this.#R = (h)=>{
            e[h] = t[h] !== 0 ? this.#S.now() : 0, s(h, t[h]);
        };
        let s = this.ttlAutopurge ? (h, a)=>{
            if (i?.[h] && (clearTimeout(i[h]), i[h] = void 0), a && a !== 0 && i) {
                let o = setTimeout(()=>{
                    this.#p(h) && this.#z(this.#i[h], "expire");
                }, a + 1);
                o.unref && o.unref(), i[h] = o;
            }
        } : ()=>{};
        this.#E = (h, a)=>{
            if (t[a]) {
                let o = t[a], m = e[a];
                if (!o || !m) return;
                h.ttl = o, h.start = m, h.now = n || r();
                let S = h.now - m;
                h.remainingTTL = o - S;
            }
        };
        let n = 0, r = ()=>{
            let h = this.#S.now();
            if (this.ttlResolution > 0) {
                n = h;
                let a = setTimeout(()=>n = 0, this.ttlResolution);
                a.unref && a.unref();
            }
            return h;
        };
        this.getRemainingTTL = (h)=>{
            let a = this.#s.get(h);
            if (a === void 0) return 0;
            let o = t[a], m = e[a];
            if (!o || !m) return 1 / 0;
            let S = (n || r()) - m;
            return o - S;
        }, this.#p = (h)=>{
            let a = e[h], o = t[h];
            return !!o && !!a && (n || r()) - a > o;
        };
    }
    #R = ()=>{};
    #E = ()=>{};
    #N = ()=>{};
    #p = ()=>!1;
    #X() {
        let t = new W(this.#o);
        this.#b = 0, this.#y = t, this.#C = (e)=>{
            this.#b -= t[e], t[e] = 0;
        }, this.#V = (e, i, s, n)=>{
            if (this.#e(i)) return 0;
            if (!T(s)) if (n) {
                if (typeof n != "function") throw new TypeError("sizeCalculation must be a function");
                if (s = n(i, e), !T(s)) throw new TypeError("sizeCalculation return invalid (expect positive integer)");
            } else throw new TypeError("invalid size value (must be positive integer). When maxSize or maxEntrySize is used, sizeCalculation or size must be set.");
            return s;
        }, this.#I = (e, i, s)=>{
            if (t[e] = i, this.#c) {
                let n = this.#c - t[e];
                for(; this.#b > n;)this.#P(!0);
            }
            this.#b += t[e], s && (s.entrySize = i, s.totalCalculatedSize = this.#b);
        };
    }
    #C = (t)=>{};
    #I = (t, e, i)=>{};
    #V = (t, e, i, s)=>{
        if (i || s) throw new TypeError("cannot set size without setting maxSize or maxEntrySize on cache");
        return 0;
    };
    *#A({ allowStale: t = this.allowStale } = {}) {
        if (this.#n) for(let e = this.#h; this.#q(e) && ((t || !this.#p(e)) && (yield e), e !== this.#a);)e = this.#u[e];
    }
    *#v({ allowStale: t = this.allowStale } = {}) {
        if (this.#n) for(let e = this.#a; this.#q(e) && ((t || !this.#p(e)) && (yield e), e !== this.#h);)e = this.#l[e];
    }
    #q(t) {
        return t !== void 0 && this.#s.get(this.#i[t]) === t;
    }
    *entries() {
        for (let t of this.#A())this.#t[t] !== void 0 && this.#i[t] !== void 0 && !this.#e(this.#t[t]) && (yield [
            this.#i[t],
            this.#t[t]
        ]);
    }
    *rentries() {
        for (let t of this.#v())this.#t[t] !== void 0 && this.#i[t] !== void 0 && !this.#e(this.#t[t]) && (yield [
            this.#i[t],
            this.#t[t]
        ]);
    }
    *keys() {
        for (let t of this.#A()){
            let e = this.#i[t];
            e !== void 0 && !this.#e(this.#t[t]) && (yield e);
        }
    }
    *rkeys() {
        for (let t of this.#v()){
            let e = this.#i[t];
            e !== void 0 && !this.#e(this.#t[t]) && (yield e);
        }
    }
    *values() {
        for (let t of this.#A())this.#t[t] !== void 0 && !this.#e(this.#t[t]) && (yield this.#t[t]);
    }
    *rvalues() {
        for (let t of this.#v())this.#t[t] !== void 0 && !this.#e(this.#t[t]) && (yield this.#t[t]);
    }
    [Symbol.iterator]() {
        return this.entries();
    }
    [Symbol.toStringTag] = "LRUCache";
    find(t, e = {}) {
        for (let i of this.#A()){
            let s = this.#t[i], n = this.#e(s) ? s.__staleWhileFetching : s;
            if (n !== void 0 && t(n, this.#i[i], this)) return this.#x(this.#i[i], e);
        }
    }
    forEach(t, e = this) {
        for (let i of this.#A()){
            let s = this.#t[i], n = this.#e(s) ? s.__staleWhileFetching : s;
            n !== void 0 && t.call(e, n, this.#i[i], this);
        }
    }
    rforEach(t, e = this) {
        for (let i of this.#v()){
            let s = this.#t[i], n = this.#e(s) ? s.__staleWhileFetching : s;
            n !== void 0 && t.call(e, n, this.#i[i], this);
        }
    }
    purgeStale() {
        let t = !1;
        for (let e of this.#v({
            allowStale: !0
        }))this.#p(e) && (this.#z(this.#i[e], "expire"), t = !0);
        return t;
    }
    info(t) {
        let e = this.#s.get(t);
        if (e === void 0) return;
        let i = this.#t[e], s = this.#e(i) ? i.__staleWhileFetching : i;
        if (s === void 0) return;
        let n = {
            value: s
        };
        if (this.#d && this.#F) {
            let r = this.#d[e], h = this.#F[e];
            if (r && h) {
                let a = r - (this.#S.now() - h);
                n.ttl = a, n.start = Date.now();
            }
        }
        return this.#y && (n.size = this.#y[e]), n;
    }
    dump() {
        let t = [];
        for (let e of this.#A({
            allowStale: !0
        })){
            let i = this.#i[e], s = this.#t[e], n = this.#e(s) ? s.__staleWhileFetching : s;
            if (n === void 0 || i === void 0) continue;
            let r = {
                value: n
            };
            if (this.#d && this.#F) {
                r.ttl = this.#d[e];
                let h = this.#S.now() - this.#F[e];
                r.start = Math.floor(Date.now() - h);
            }
            this.#y && (r.size = this.#y[e]), t.unshift([
                i,
                r
            ]);
        }
        return t;
    }
    load(t) {
        this.clear();
        for (let [e, i] of t){
            if (i.start) {
                let s = Date.now() - i.start;
                i.start = this.#S.now() - s;
            }
            this.#O(e, i.value, i);
        }
    }
    set(t, e, i = {}) {
        let { status: s = d.metrics.hasSubscribers ? {} : void 0 } = i;
        i.status = s, s && (s.op = "set", s.key = t, e !== void 0 && (s.value = e), s.cache = this);
        let n = this.#O(t, e, i);
        return s && d.metrics.hasSubscribers && d.metrics.publish(s), n;
    }
    #O(t, e, i, s) {
        let { ttl: n = this.ttl, start: r, noDisposeOnSet: h = this.noDisposeOnSet, sizeCalculation: a = this.sizeCalculation, status: o } = i;
        if (e === void 0) return o && (o.set = "deleted"), this.delete(t), this;
        let { noUpdateTTL: m = this.noUpdateTTL } = i, S = this.#e(e);
        o && !S && (o.value = e);
        let y = this.#V(t, e, i.size || 0, a, o);
        if (this.maxEntrySize && y > this.maxEntrySize) return this.#z(t, "set"), o && (o.set = "miss", o.maxEntrySizeExceeded = !0), this;
        let u = this.#n === 0 ? void 0 : this.#s.get(t);
        if (u === void 0) u = this.#n === 0 ? this.#h : this.#_.length !== 0 ? this.#_.pop() : this.#n === this.#o ? this.#P(!1) : this.#n, this.#i[u] = t, this.#t[u] = e, this.#s.set(t, u), this.#l[this.#h] = u, this.#u[u] = this.#h, this.#h = u, this.#n++, this.#I(u, y, o), o && (o.set = "add"), m = !1, this.#D && !S && this.#W?.(e, t, "add");
        else {
            this.#L(u);
            let g = this.#t[u];
            if (e !== g) {
                if (!h) if (this.#e(g)) {
                    g !== s && g.__abortController.abort(new Error("replaced"));
                    let { __staleWhileFetching: f } = g;
                    f !== void 0 && f !== e && (this.#T && this.#m?.(f, t, "set"), this.#f && this.#r?.push([
                        f,
                        t,
                        "set"
                    ]));
                } else this.#T && this.#m?.(g, t, "set"), this.#f && this.#r?.push([
                    g,
                    t,
                    "set"
                ]);
                if (this.#C(u), this.#I(u, y, o), this.#t[u] = e, !S) {
                    let f = g && this.#e(g) ? g.__staleWhileFetching : g, _ = f === void 0 ? "add" : e !== f ? "replace" : "update";
                    o && (o.set = _, f !== void 0 && (o.oldValue = f)), this.#D && this.onInsert?.(e, t, _);
                }
            } else S || (o && (o.set = "update"), this.#D && this.onInsert?.(e, t, "update"));
        }
        if (n !== 0 && !this.#d && this.#H(), this.#d && (m || this.#N(u, n, r), o && this.#E(o, u)), !h && this.#f && this.#r) {
            let g = this.#r, f;
            for(; f = g?.shift();)this.#w?.(...f);
        }
        return this;
    }
    pop() {
        try {
            for(; this.#n;){
                let t = this.#t[this.#a];
                if (this.#P(!0), this.#e(t)) {
                    if (t.__staleWhileFetching) return t.__staleWhileFetching;
                } else if (t !== void 0) return t;
            }
        } finally{
            if (this.#f && this.#r) {
                let t = this.#r, e;
                for(; e = t?.shift();)this.#w?.(...e);
            }
        }
    }
    #P(t) {
        let e = this.#a, i = this.#i[e], s = this.#t[e], n = this.#e(s);
        n && s.__abortController.abort(new Error("evicted"));
        let r = n ? s.__staleWhileFetching : s;
        return (this.#T || this.#f) && r !== void 0 && (this.#T && this.#m?.(r, i, "evict"), this.#f && this.#r?.push([
            r,
            i,
            "evict"
        ])), this.#C(e), this.#g?.[e] && (clearTimeout(this.#g[e]), this.#g[e] = void 0), t && (this.#i[e] = void 0, this.#t[e] = void 0, this.#_.push(e)), this.#n === 1 ? (this.#a = this.#h = 0, this.#_.length = 0) : this.#a = this.#l[e], this.#s.delete(i), this.#n--, e;
    }
    has(t, e = {}) {
        let { status: i = d.metrics.hasSubscribers ? {} : void 0 } = e;
        e.status = i, i && (i.op = "has", i.key = t, i.cache = this);
        let s = this.#Y(t, e);
        return d.metrics.hasSubscribers && d.metrics.publish(i), s;
    }
    #Y(t, e = {}) {
        let { updateAgeOnHas: i = this.updateAgeOnHas, status: s } = e, n = this.#s.get(t);
        if (n !== void 0) {
            let r = this.#t[n];
            if (this.#e(r) && r.__staleWhileFetching === void 0) return !1;
            if (this.#p(n)) s && (s.has = "stale", this.#E(s, n));
            else return i && this.#R(n), s && (s.has = "hit", this.#E(s, n)), !0;
        } else s && (s.has = "miss");
        return !1;
    }
    peek(t, e = {}) {
        let { status: i = C() ? {} : void 0 } = e;
        i && (i.op = "peek", i.key = t, i.cache = this), e.status = i;
        let s = this.#J(t, e);
        return d.metrics.hasSubscribers && d.metrics.publish(i), s;
    }
    #J(t, e) {
        let { status: i, allowStale: s = this.allowStale } = e, n = this.#s.get(t);
        if (n === void 0 || !s && this.#p(n)) {
            i && (i.peek = n === void 0 ? "miss" : "stale");
            return;
        }
        let r = this.#t[n], h = this.#e(r) ? r.__staleWhileFetching : r;
        return i && (h !== void 0 ? (i.peek = "hit", i.value = h) : i.peek = "miss"), h;
    }
    #G(t, e, i, s) {
        let n = e === void 0 ? void 0 : this.#t[e];
        if (this.#e(n)) return n;
        let r = new AbortController, { signal: h } = i;
        h?.addEventListener("abort", ()=>r.abort(h.reason), {
            signal: r.signal
        });
        let a = {
            signal: r.signal,
            options: i,
            context: s
        }, o = (f, _ = !1)=>{
            let { aborted: l } = r.signal, w = i.ignoreFetchAbort && f !== void 0, F = i.ignoreFetchAbort || !!(i.allowStaleOnFetchAbort && f !== void 0);
            if (i.status && (l && !_ ? (i.status.fetchAborted = !0, i.status.fetchError = r.signal.reason, w && (i.status.fetchAbortIgnored = !0)) : i.status.fetchResolved = !0), l && !w && !_) return S(r.signal.reason, F);
            let b = u, p = this.#t[e];
            return (p === u || p === void 0 && w && _) && (f === void 0 ? b.__staleWhileFetching !== void 0 ? this.#t[e] = b.__staleWhileFetching : this.#z(t, "fetch") : (i.status && (i.status.fetchUpdated = !0), this.#O(t, f, a.options, b))), f;
        }, m = (f)=>(i.status && (i.status.fetchRejected = !0, i.status.fetchError = f), S(f, !1)), S = (f, _)=>{
            let { aborted: l } = r.signal, w = l && i.allowStaleOnFetchAbort, F = w || i.allowStaleOnFetchRejection, b = F || i.noDeleteOnFetchRejection, p = u;
            if (this.#t[e] === u && (!b || !_ && p.__staleWhileFetching === void 0 ? this.#z(t, "fetch") : w || (this.#t[e] = p.__staleWhileFetching)), F) return i.status && p.__staleWhileFetching !== void 0 && (i.status.returnedStale = !0), p.__staleWhileFetching;
            if (p.__returned === p) throw f;
        }, y = (f, _)=>{
            let l = this.#M?.(t, n, a);
            r.signal.addEventListener("abort", ()=>{
                (!i.ignoreFetchAbort || i.allowStaleOnFetchAbort) && (f(void 0), i.allowStaleOnFetchAbort && (f = (w)=>o(w, !0)));
            }), l && l instanceof Promise ? l.then((w)=>f(w === void 0 ? void 0 : w), _) : l !== void 0 && f(l);
        };
        i.status && (i.status.fetchDispatched = !0);
        let u = new Promise(y).then(o, m), g = Object.assign(u, {
            __abortController: r,
            __staleWhileFetching: n,
            __returned: void 0
        });
        return e === void 0 ? (this.#O(t, g, {
            ...a.options,
            status: void 0
        }), e = this.#s.get(t)) : this.#t[e] = g, g;
    }
    #e(t) {
        if (!this.#U) return !1;
        let e = t;
        return !!e && e instanceof Promise && e.hasOwnProperty("__staleWhileFetching") && e.__abortController instanceof AbortController;
    }
    fetch(t, e = {}) {
        let i = d.tracing.hasSubscribers, { status: s = C() ? {} : void 0 } = e;
        e.status = s, s && e.context && (s.context = e.context);
        let n = this.#B(t, e);
        return s && i && (s.trace = !0, d.tracing.tracePromise(()=>n, s).catch(()=>{})), n;
    }
    async #B(t, e = {}) {
        let { allowStale: i = this.allowStale, updateAgeOnGet: s = this.updateAgeOnGet, noDeleteOnStaleGet: n = this.noDeleteOnStaleGet, ttl: r = this.ttl, noDisposeOnSet: h = this.noDisposeOnSet, size: a = 0, sizeCalculation: o = this.sizeCalculation, noUpdateTTL: m = this.noUpdateTTL, noDeleteOnFetchRejection: S = this.noDeleteOnFetchRejection, allowStaleOnFetchRejection: y = this.allowStaleOnFetchRejection, ignoreFetchAbort: u = this.ignoreFetchAbort, allowStaleOnFetchAbort: g = this.allowStaleOnFetchAbort, context: f, forceRefresh: _ = !1, status: l, signal: w } = e;
        if (l && (l.op = "fetch", l.key = t, _ && (l.forceRefresh = !0), l.cache = this), !this.#U) return l && (l.fetch = "get"), this.#x(t, {
            allowStale: i,
            updateAgeOnGet: s,
            noDeleteOnStaleGet: n,
            status: l
        });
        let F = {
            allowStale: i,
            updateAgeOnGet: s,
            noDeleteOnStaleGet: n,
            ttl: r,
            noDisposeOnSet: h,
            size: a,
            sizeCalculation: o,
            noUpdateTTL: m,
            noDeleteOnFetchRejection: S,
            allowStaleOnFetchRejection: y,
            allowStaleOnFetchAbort: g,
            ignoreFetchAbort: u,
            status: l,
            signal: w
        }, b = this.#s.get(t);
        if (b === void 0) {
            l && (l.fetch = "miss");
            let p = this.#G(t, b, F, f);
            return p.__returned = p;
        } else {
            let p = this.#t[b];
            if (this.#e(p)) {
                let E = i && p.__staleWhileFetching !== void 0;
                return l && (l.fetch = "inflight", E && (l.returnedStale = !0)), E ? p.__staleWhileFetching : p.__returned = p;
            }
            let A = this.#p(b);
            if (!_ && !A) return l && (l.fetch = "hit"), this.#L(b), s && this.#R(b), l && this.#E(l, b), p;
            let v = this.#G(t, b, F, f), z = v.__staleWhileFetching !== void 0 && i;
            return l && (l.fetch = A ? "stale" : "refresh", z && A && (l.returnedStale = !0)), z ? v.__staleWhileFetching : v.__returned = v;
        }
    }
    forceFetch(t, e = {}) {
        let i = d.tracing.hasSubscribers, { status: s = C() ? {} : void 0 } = e;
        e.status = s, s && e.context && (s.context = e.context);
        let n = this.#K(t, e);
        return s && i && (s.trace = !0, d.tracing.tracePromise(()=>n, s).catch(()=>{})), n;
    }
    async #K(t, e = {}) {
        let i = await this.#B(t, e);
        if (i === void 0) throw new Error("fetch() returned undefined");
        return i;
    }
    memo(t, e = {}) {
        let { status: i = d.metrics.hasSubscribers ? {} : void 0 } = e;
        e.status = i, i && (i.op = "memo", i.key = t, e.context && (i.context = e.context), i.cache = this);
        let s = this.#Q(t, e);
        return i && (i.value = s), d.metrics.hasSubscribers && d.metrics.publish(i), s;
    }
    #Q(t, e = {}) {
        let i = this.#j;
        if (!i) throw new Error("no memoMethod provided to constructor");
        let { context: s, status: n, forceRefresh: r, ...h } = e;
        n && r && (n.forceRefresh = !0);
        let a = this.#x(t, h), o = r || a === void 0;
        if (n && (n.memo = o ? "miss" : "hit", o || (n.value = a)), !o) return a;
        let m = i(t, a, {
            options: h,
            context: s
        });
        return n && (n.value = m), this.#O(t, m, h), m;
    }
    get(t, e = {}) {
        let { status: i = d.metrics.hasSubscribers ? {} : void 0 } = e;
        e.status = i, i && (i.op = "get", i.key = t, i.cache = this);
        let s = this.#x(t, e);
        return i && (s !== void 0 && (i.value = s), d.metrics.hasSubscribers && d.metrics.publish(i)), s;
    }
    #x(t, e = {}) {
        let { allowStale: i = this.allowStale, updateAgeOnGet: s = this.updateAgeOnGet, noDeleteOnStaleGet: n = this.noDeleteOnStaleGet, status: r } = e, h = this.#s.get(t);
        if (h === void 0) {
            r && (r.get = "miss");
            return;
        }
        let a = this.#t[h], o = this.#e(a);
        return r && this.#E(r, h), this.#p(h) ? o ? (r && (r.get = "stale-fetching"), i && a.__staleWhileFetching !== void 0 ? (r && (r.returnedStale = !0), a.__staleWhileFetching) : void 0) : (n || this.#z(t, "expire"), r && (r.get = "stale"), i ? (r && (r.returnedStale = !0), a) : void 0) : (r && (r.get = o ? "fetching" : "hit"), this.#L(h), s && this.#R(h), o ? a.__staleWhileFetching : a);
    }
    #k(t, e) {
        this.#u[e] = t, this.#l[t] = e;
    }
    #L(t) {
        t !== this.#h && (t === this.#a ? this.#a = this.#l[t] : this.#k(this.#u[t], this.#l[t]), this.#k(this.#h, t), this.#h = t);
    }
    delete(t) {
        return this.#z(t, "delete");
    }
    #z(t, e) {
        d.metrics.hasSubscribers && d.metrics.publish({
            op: "delete",
            delete: e,
            key: t,
            cache: this
        });
        let i = !1;
        if (this.#n !== 0) {
            let s = this.#s.get(t);
            if (s !== void 0) if (this.#g?.[s] && (clearTimeout(this.#g?.[s]), this.#g[s] = void 0), i = !0, this.#n === 1) this.#$(e);
            else {
                this.#C(s);
                let n = this.#t[s];
                if (this.#e(n) ? n.__abortController.abort(new Error("deleted")) : (this.#T || this.#f) && (this.#T && this.#m?.(n, t, e), this.#f && this.#r?.push([
                    n,
                    t,
                    e
                ])), this.#s.delete(t), this.#i[s] = void 0, this.#t[s] = void 0, s === this.#h) this.#h = this.#u[s];
                else if (s === this.#a) this.#a = this.#l[s];
                else {
                    let r = this.#u[s];
                    this.#l[r] = this.#l[s];
                    let h = this.#l[s];
                    this.#u[h] = this.#u[s];
                }
                this.#n--, this.#_.push(s);
            }
        }
        if (this.#f && this.#r?.length) {
            let s = this.#r, n;
            for(; n = s?.shift();)this.#w?.(...n);
        }
        return i;
    }
    clear() {
        return this.#$("delete");
    }
    #$(t) {
        for (let e of this.#v({
            allowStale: !0
        })){
            let i = this.#t[e];
            if (this.#e(i)) i.__abortController.abort(new Error("deleted"));
            else {
                let s = this.#i[e];
                this.#T && this.#m?.(i, s, t), this.#f && this.#r?.push([
                    i,
                    s,
                    t
                ]);
            }
        }
        if (this.#s.clear(), this.#t.fill(void 0), this.#i.fill(void 0), this.#d && this.#F) {
            this.#d.fill(0), this.#F.fill(0);
            for (let e of this.#g ?? [])e !== void 0 && clearTimeout(e);
            this.#g?.fill(void 0);
        }
        if (this.#y && this.#y.fill(0), this.#a = 0, this.#h = 0, this.#_.length = 0, this.#b = 0, this.#n = 0, this.#f && this.#r) {
            let e = this.#r, i;
            for(; i = e?.shift();)this.#w?.(...i);
        }
    }
};
exports.LRUCache = L; //# sourceMappingURL=index.min.js.map
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/reusify@1.1.0/node_modules/reusify/reusify.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

function reusify(Constructor) {
    var head = new Constructor();
    var tail = head;
    function get() {
        var current = head;
        if (current.next) {
            head = current.next;
        } else {
            head = new Constructor();
            tail = head;
        }
        current.next = null;
        return current;
    }
    function release(obj) {
        tail.next = obj;
        tail = obj;
    }
    return {
        get: get,
        release: release
    };
}
module.exports = reusify;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/fastq@1.20.1/node_modules/fastq/queue.js [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

/* eslint-disable no-var */ var reusify = __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/reusify@1.1.0/node_modules/reusify/reusify.js [instrumentation] (ecmascript)");
function fastqueue(context, worker, _concurrency) {
    if (typeof context === 'function') {
        _concurrency = worker;
        worker = context;
        context = null;
    }
    if (!(_concurrency >= 1)) {
        throw new Error('fastqueue concurrency must be equal to or greater than 1');
    }
    var cache = reusify(Task);
    var queueHead = null;
    var queueTail = null;
    var _running = 0;
    var errorHandler = null;
    var self = {
        push: push,
        drain: noop,
        saturated: noop,
        pause: pause,
        paused: false,
        get concurrency () {
            return _concurrency;
        },
        set concurrency (value){
            if (!(value >= 1)) {
                throw new Error('fastqueue concurrency must be equal to or greater than 1');
            }
            _concurrency = value;
            if (self.paused) return;
            for(; queueHead && _running < _concurrency;){
                _running++;
                release();
            }
        },
        running: running,
        resume: resume,
        idle: idle,
        length: length,
        getQueue: getQueue,
        unshift: unshift,
        empty: noop,
        kill: kill,
        killAndDrain: killAndDrain,
        error: error,
        abort: abort
    };
    return self;
    //TURBOPACK unreachable
    ;
    function running() {
        return _running;
    }
    function pause() {
        self.paused = true;
    }
    function length() {
        var current = queueHead;
        var counter = 0;
        while(current){
            current = current.next;
            counter++;
        }
        return counter;
    }
    function getQueue() {
        var current = queueHead;
        var tasks = [];
        while(current){
            tasks.push(current.value);
            current = current.next;
        }
        return tasks;
    }
    function resume() {
        if (!self.paused) return;
        self.paused = false;
        if (queueHead === null) {
            _running++;
            release();
            return;
        }
        for(; queueHead && _running < _concurrency;){
            _running++;
            release();
        }
    }
    function idle() {
        return _running === 0 && self.length() === 0;
    }
    function push(value1, done) {
        var current = cache.get();
        current.context = context;
        current.release = release;
        current.value = value1;
        current.callback = done || noop;
        current.errorHandler = errorHandler;
        if (_running >= _concurrency || self.paused) {
            if (queueTail) {
                queueTail.next = current;
                queueTail = current;
            } else {
                queueHead = current;
                queueTail = current;
                self.saturated();
            }
        } else {
            _running++;
            worker.call(context, current.value, current.worked);
        }
    }
    function unshift(value1, done) {
        var current = cache.get();
        current.context = context;
        current.release = release;
        current.value = value1;
        current.callback = done || noop;
        current.errorHandler = errorHandler;
        if (_running >= _concurrency || self.paused) {
            if (queueHead) {
                current.next = queueHead;
                queueHead = current;
            } else {
                queueHead = current;
                queueTail = current;
                self.saturated();
            }
        } else {
            _running++;
            worker.call(context, current.value, current.worked);
        }
    }
    function release(holder) {
        if (holder) {
            cache.release(holder);
        }
        var next = queueHead;
        if (next && _running <= _concurrency) {
            if (!self.paused) {
                if (queueTail === queueHead) {
                    queueTail = null;
                }
                queueHead = next.next;
                next.next = null;
                worker.call(context, next.value, next.worked);
                if (queueTail === null) {
                    self.empty();
                }
            } else {
                _running--;
            }
        } else if (--_running === 0) {
            self.drain();
        }
    }
    function kill() {
        queueHead = null;
        queueTail = null;
        self.drain = noop;
    }
    function killAndDrain() {
        queueHead = null;
        queueTail = null;
        self.drain();
        self.drain = noop;
    }
    function abort() {
        var current = queueHead;
        queueHead = null;
        queueTail = null;
        while(current){
            var next = current.next;
            var callback = current.callback;
            var errorHandler = current.errorHandler;
            var val = current.value;
            var context = current.context;
            // Reset the task state
            current.value = null;
            current.callback = noop;
            current.errorHandler = null;
            // Call error handler if present
            if (errorHandler) {
                errorHandler(new Error('abort'), val);
            }
            // Call callback with error
            callback.call(context, new Error('abort'));
            // Release the task back to the pool
            current.release(current);
            current = next;
        }
        self.drain = noop;
    }
    function error(handler) {
        errorHandler = handler;
    }
}
function noop() {}
function Task() {
    this.value = null;
    this.callback = noop;
    this.next = null;
    this.release = noop;
    this.context = null;
    this.errorHandler = null;
    var self = this;
    this.worked = function worked(err, result) {
        var callback = self.callback;
        var errorHandler = self.errorHandler;
        var val = self.value;
        self.value = null;
        self.callback = noop;
        if (self.errorHandler) {
            errorHandler(err, val);
        }
        callback.call(self.context, err, result);
        self.release(self);
    };
}
function queueAsPromised(context, worker, _concurrency) {
    if (typeof context === 'function') {
        _concurrency = worker;
        worker = context;
        context = null;
    }
    function asyncWrapper(arg, cb) {
        worker.call(this, arg).then(function(res) {
            cb(null, res);
        }, cb);
    }
    var queue = fastqueue(context, asyncWrapper, _concurrency);
    var pushCb = queue.push;
    var unshiftCb = queue.unshift;
    queue.push = push;
    queue.unshift = unshift;
    queue.drained = drained;
    return queue;
    //TURBOPACK unreachable
    ;
    function push(value1) {
        var p = new Promise(function(resolve, reject) {
            pushCb(value1, function(err, result) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(result);
            });
        });
        // Let's fork the promise chain to
        // make the error bubble up to the user but
        // not lead to a unhandledRejection
        p.catch(noop);
        return p;
    }
    function unshift(value1) {
        var p = new Promise(function(resolve, reject) {
            unshiftCb(value1, function(err, result) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(result);
            });
        });
        // Let's fork the promise chain to
        // make the error bubble up to the user but
        // not lead to a unhandledRejection
        p.catch(noop);
        return p;
    }
    function drained() {
        var p = new Promise(function(resolve) {
            process.nextTick(function() {
                if (queue.idle()) {
                    resolve();
                } else {
                    var previousDrain = queue.drain;
                    queue.drain = function() {
                        if (typeof previousDrain === 'function') previousDrain();
                        resolve();
                        queue.drain = previousDrain;
                    };
                }
            });
        });
        return p;
    }
}
module.exports = fastqueue;
module.exports.promise = queueAsPromised;
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/croner@10.0.1/node_modules/croner/dist/croner.cjs [instrumentation] (ecmascript)", ((__turbopack_context__, module, exports) => {

var D = Object.defineProperty;
var U = Object.getOwnPropertyDescriptor;
var S = Object.getOwnPropertyNames;
var z = Object.prototype.hasOwnProperty;
var I = (s, e)=>{
    for(var t in e)D(s, t, {
        get: e[t],
        enumerable: !0
    });
}, L = (s, e, t, r)=>{
    if (e && typeof e == "object" || typeof e == "function") for (let n of S(e))!z.call(s, n) && n !== t && D(s, n, {
        get: ()=>e[n],
        enumerable: !(r = U(e, n)) || r.enumerable
    });
    return s;
};
var Y = (s)=>L(D({}, "__esModule", {
        value: !0
    }), s);
var $ = {};
I($, {
    Cron: ()=>R,
    CronDate: ()=>m,
    CronPattern: ()=>p,
    scheduledJobs: ()=>b
});
module.exports = Y($);
function C(s) {
    return Date.UTC(s.y, s.m - 1, s.d, s.h, s.i, s.s);
}
function v(s, e) {
    return s.y === e.y && s.m === e.m && s.d === e.d && s.h === e.h && s.i === e.i && s.s === e.s;
}
function F(s, e) {
    let t = new Date(Date.parse(s));
    if (isNaN(t)) throw new Error("Invalid ISO8601 passed to timezone parser.");
    let r = s.substring(9);
    return r.includes("Z") || r.includes("+") || r.includes("-") ? w(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), t.getUTCHours(), t.getUTCMinutes(), t.getUTCSeconds(), "Etc/UTC") : w(t.getFullYear(), t.getMonth() + 1, t.getDate(), t.getHours(), t.getMinutes(), t.getSeconds(), e);
}
function k(s, e, t) {
    return O(F(s, e), t);
}
function O(s, e) {
    let t = new Date(C(s)), r = g(t, s.tz), n = C(s), i = C(r), a = n - i, o = new Date(t.getTime() + a), h = g(o, s.tz);
    if (v(h, s)) {
        let u = new Date(o.getTime() - 36e5), d = g(u, s.tz);
        return v(d, s) ? u : o;
    }
    let l = new Date(o.getTime() + C(s) - C(h)), y = g(l, s.tz);
    if (v(y, s)) return l;
    if (e) throw new Error("Invalid date passed to fromTZ()");
    return o.getTime() > l.getTime() ? o : l;
}
function g(s, e) {
    let t, r;
    try {
        t = new Intl.DateTimeFormat("en-US", {
            timeZone: e,
            year: "numeric",
            month: "numeric",
            day: "numeric",
            hour: "numeric",
            minute: "numeric",
            second: "numeric",
            hour12: !1
        }), r = t.formatToParts(s);
    } catch (i) {
        let a = i instanceof Error ? i.message : String(i);
        throw new RangeError(`toTZ: Invalid timezone '${e}' or date. Please provide a valid IANA timezone (e.g., 'America/New_York', 'Europe/Stockholm'). Original error: ${a}`);
    }
    let n = {
        year: 0,
        month: 0,
        day: 0,
        hour: 0,
        minute: 0,
        second: 0
    };
    for (let i of r)(i.type === "year" || i.type === "month" || i.type === "day" || i.type === "hour" || i.type === "minute" || i.type === "second") && (n[i.type] = parseInt(i.value, 10));
    if (isNaN(n.year) || isNaN(n.month) || isNaN(n.day) || isNaN(n.hour) || isNaN(n.minute) || isNaN(n.second)) throw new Error(`toTZ: Failed to parse all date components from timezone '${e}'. This may indicate an invalid date or timezone configuration. Parsed components: ${JSON.stringify(n)}`);
    return n.hour === 24 && (n.hour = 0), {
        y: n.year,
        m: n.month,
        d: n.day,
        h: n.hour,
        i: n.minute,
        s: n.second,
        tz: e
    };
}
function w(s, e, t, r, n, i, a) {
    return {
        y: s,
        m: e,
        d: t,
        h: r,
        i: n,
        s: i,
        tz: a
    };
}
var N = [
    1,
    2,
    4,
    8,
    16
], p = class {
    pattern;
    timezone;
    mode;
    alternativeWeekdays;
    sloppyRanges;
    second;
    minute;
    hour;
    day;
    month;
    dayOfWeek;
    year;
    lastDayOfMonth;
    lastWeekday;
    nearestWeekdays;
    starDOM;
    starDOW;
    starYear;
    useAndLogic;
    constructor(e, t, r){
        this.pattern = e, this.timezone = t, this.mode = r?.mode ?? "auto", this.alternativeWeekdays = r?.alternativeWeekdays ?? !1, this.sloppyRanges = r?.sloppyRanges ?? !1, this.second = Array(60).fill(0), this.minute = Array(60).fill(0), this.hour = Array(24).fill(0), this.day = Array(31).fill(0), this.month = Array(12).fill(0), this.dayOfWeek = Array(7).fill(0), this.year = Array(1e4).fill(0), this.lastDayOfMonth = !1, this.lastWeekday = !1, this.nearestWeekdays = Array(31).fill(0), this.starDOM = !1, this.starDOW = !1, this.starYear = !1, this.useAndLogic = !1, this.parse();
    }
    parse() {
        if (!(typeof this.pattern == "string" || this.pattern instanceof String)) throw new TypeError("CronPattern: Pattern has to be of type string.");
        this.pattern.indexOf("@") >= 0 && (this.pattern = this.handleNicknames(this.pattern).trim());
        let e = this.pattern.match(/\S+/g) || [
            ""
        ], t = e.length;
        if (e.length < 5 || e.length > 7) throw new TypeError("CronPattern: invalid configuration format ('" + this.pattern + "'), exactly five, six, or seven space separated parts are required.");
        if (this.mode !== "auto") {
            let n;
            switch(this.mode){
                case "5-part":
                    n = 5;
                    break;
                case "6-part":
                    n = 6;
                    break;
                case "7-part":
                    n = 7;
                    break;
                case "5-or-6-parts":
                    n = [
                        5,
                        6
                    ];
                    break;
                case "6-or-7-parts":
                    n = [
                        6,
                        7
                    ];
                    break;
                default:
                    n = 0;
            }
            if (!(Array.isArray(n) ? n.includes(t) : t === n)) {
                let a = Array.isArray(n) ? n.join(" or ") : n.toString();
                throw new TypeError(`CronPattern: mode '${this.mode}' requires exactly ${a} parts, but pattern '${this.pattern}' has ${t} parts.`);
            }
        }
        if (e.length === 5 && e.unshift("0"), e.length === 6 && e.push("*"), e[3].toUpperCase() === "LW" ? (this.lastWeekday = !0, e[3] = "") : e[3].toUpperCase().indexOf("L") >= 0 && (e[3] = e[3].replace(/L/gi, ""), this.lastDayOfMonth = !0), e[3] == "*" && (this.starDOM = !0), e[6] == "*" && (this.starYear = !0), e[4].length >= 3 && (e[4] = this.replaceAlphaMonths(e[4])), e[5].length >= 3 && (e[5] = this.alternativeWeekdays ? this.replaceAlphaDaysQuartz(e[5]) : this.replaceAlphaDays(e[5])), e[5].startsWith("+") && (this.useAndLogic = !0, e[5] = e[5].substring(1), e[5] === "")) throw new TypeError("CronPattern: Day-of-week field cannot be empty after '+' modifier.");
        switch(e[5] == "*" && (this.starDOW = !0), this.pattern.indexOf("?") >= 0 && (e[0] = e[0].replace(/\?/g, "*"), e[1] = e[1].replace(/\?/g, "*"), e[2] = e[2].replace(/\?/g, "*"), e[3] = e[3].replace(/\?/g, "*"), e[4] = e[4].replace(/\?/g, "*"), e[5] = e[5].replace(/\?/g, "*"), e[6] && (e[6] = e[6].replace(/\?/g, "*"))), this.mode){
            case "5-part":
                e[0] = "0", e[6] = "*";
                break;
            case "6-part":
                e[6] = "*";
                break;
            case "5-or-6-parts":
                e[6] = "*";
                break;
            case "6-or-7-parts":
                break;
            case "7-part":
            case "auto":
                break;
        }
        this.throwAtIllegalCharacters(e), this.partToArray("second", e[0], 0, 1), this.partToArray("minute", e[1], 0, 1), this.partToArray("hour", e[2], 0, 1), this.partToArray("day", e[3], -1, 1), this.partToArray("month", e[4], -1, 1);
        let r = this.alternativeWeekdays ? -1 : 0;
        this.partToArray("dayOfWeek", e[5], r, 63), this.partToArray("year", e[6], 0, 1), !this.alternativeWeekdays && this.dayOfWeek[7] && (this.dayOfWeek[0] = this.dayOfWeek[7]);
    }
    partToArray(e, t, r, n) {
        let i = this[e], a = e === "day" && this.lastDayOfMonth, o = e === "day" && this.lastWeekday;
        if (t === "" && !a && !o) throw new TypeError("CronPattern: configuration entry " + e + " (" + t + ") is empty, check for trailing spaces.");
        if (t === "*") return i.fill(n);
        let h = t.split(",");
        if (h.length > 1) for(let l = 0; l < h.length; l++)this.partToArray(e, h[l], r, n);
        else t.indexOf("-") !== -1 && t.indexOf("/") !== -1 ? this.handleRangeWithStepping(t, e, r, n) : t.indexOf("-") !== -1 ? this.handleRange(t, e, r, n) : t.indexOf("/") !== -1 ? this.handleStepping(t, e, r, n) : t !== "" && this.handleNumber(t, e, r, n);
    }
    throwAtIllegalCharacters(e) {
        for(let t = 0; t < e.length; t++)if ((t === 3 ? /[^/*0-9,\-WwLl]+/ : t === 5 ? /[^/*0-9,\-#Ll]+/ : /[^/*0-9,\-]+/).test(e[t])) throw new TypeError("CronPattern: configuration entry " + t + " (" + e[t] + ") contains illegal characters.");
    }
    handleNumber(e, t, r, n) {
        let i = this.extractNth(e, t), a = e.toUpperCase().includes("W");
        if (t !== "day" && a) throw new TypeError("CronPattern: Nearest weekday modifier (W) only allowed in day-of-month.");
        a && (t = "nearestWeekdays");
        let o = parseInt(i[0], 10) + r;
        if (isNaN(o)) throw new TypeError("CronPattern: " + t + " is not a number: '" + e + "'");
        this.setPart(t, o, i[1] || n);
    }
    setPart(e, t, r) {
        if (!Object.prototype.hasOwnProperty.call(this, e)) throw new TypeError("CronPattern: Invalid part specified: " + e);
        if (e === "dayOfWeek") {
            if (t === 7 && (t = 0), t < 0 || t > 6) throw new RangeError("CronPattern: Invalid value for dayOfWeek: " + t);
            this.setNthWeekdayOfMonth(t, r);
            return;
        }
        if (e === "second" || e === "minute") {
            if (t < 0 || t >= 60) throw new RangeError("CronPattern: Invalid value for " + e + ": " + t);
        } else if (e === "hour") {
            if (t < 0 || t >= 24) throw new RangeError("CronPattern: Invalid value for " + e + ": " + t);
        } else if (e === "day" || e === "nearestWeekdays") {
            if (t < 0 || t >= 31) throw new RangeError("CronPattern: Invalid value for " + e + ": " + t);
        } else if (e === "month") {
            if (t < 0 || t >= 12) throw new RangeError("CronPattern: Invalid value for " + e + ": " + t);
        } else if (e === "year" && (t < 1 || t >= 1e4)) throw new RangeError("CronPattern: Invalid value for " + e + ": " + t + " (supported range: 1-9999)");
        this[e][t] = r;
    }
    validateNotNaN(e, t) {
        if (isNaN(e)) throw new TypeError(t);
    }
    validateRange(e, t, r, n, i) {
        if (e > t) throw new TypeError("CronPattern: From value is larger than to value: '" + i + "'");
        if (r !== void 0) {
            if (r === 0) throw new TypeError("CronPattern: Syntax error, illegal stepping: 0");
            if (r > this[n].length) throw new TypeError("CronPattern: Syntax error, steps cannot be greater than maximum value of part (" + this[n].length + ")");
        }
    }
    handleRangeWithStepping(e, t, r, n) {
        if (e.toUpperCase().includes("W")) throw new TypeError("CronPattern: Syntax error, W is not allowed in ranges with stepping.");
        let i = this.extractNth(e, t), a = i[0].match(/^(\d+)-(\d+)\/(\d+)$/);
        if (a === null) throw new TypeError("CronPattern: Syntax error, illegal range with stepping: '" + e + "'");
        let [, o, h, l] = a, y = parseInt(o, 10) + r, u = parseInt(h, 10) + r, d = parseInt(l, 10);
        this.validateNotNaN(y, "CronPattern: Syntax error, illegal lower range (NaN)"), this.validateNotNaN(u, "CronPattern: Syntax error, illegal upper range (NaN)"), this.validateNotNaN(d, "CronPattern: Syntax error, illegal stepping: (NaN)"), this.validateRange(y, u, d, t, e);
        for(let c = y; c <= u; c += d)this.setPart(t, c, i[1] || n);
    }
    extractNth(e, t) {
        let r = e, n;
        if (r.includes("#")) {
            if (t !== "dayOfWeek") throw new Error("CronPattern: nth (#) only allowed in day-of-week field");
            n = r.split("#")[1], r = r.split("#")[0];
        } else if (r.toUpperCase().endsWith("L")) {
            if (t !== "dayOfWeek") throw new Error("CronPattern: L modifier only allowed in day-of-week field (use L alone for day-of-month)");
            n = "L", r = r.slice(0, -1);
        }
        return [
            r,
            n
        ];
    }
    handleRange(e, t, r, n) {
        if (e.toUpperCase().includes("W")) throw new TypeError("CronPattern: Syntax error, W is not allowed in a range.");
        let i = this.extractNth(e, t), a = i[0].split("-");
        if (a.length !== 2) throw new TypeError("CronPattern: Syntax error, illegal range: '" + e + "'");
        let o = parseInt(a[0], 10) + r, h = parseInt(a[1], 10) + r;
        this.validateNotNaN(o, "CronPattern: Syntax error, illegal lower range (NaN)"), this.validateNotNaN(h, "CronPattern: Syntax error, illegal upper range (NaN)"), this.validateRange(o, h, void 0, t, e);
        for(let l = o; l <= h; l++)this.setPart(t, l, i[1] || n);
    }
    handleStepping(e, t, r, n) {
        if (e.toUpperCase().includes("W")) throw new TypeError("CronPattern: Syntax error, W is not allowed in parts with stepping.");
        let i = this.extractNth(e, t), a = i[0].split("/");
        if (a.length !== 2) throw new TypeError("CronPattern: Syntax error, illegal stepping: '" + e + "'");
        if (this.sloppyRanges) a[0] === "" && (a[0] = "*");
        else {
            if (a[0] === "") throw new TypeError("CronPattern: Syntax error, stepping with missing prefix ('" + e + "') is not allowed. Use wildcard (*/step) or range (min-max/step) instead.");
            if (a[0] !== "*") throw new TypeError("CronPattern: Syntax error, stepping with numeric prefix ('" + e + "') is not allowed. Use wildcard (*/step) or range (min-max/step) instead.");
        }
        let o = 0;
        a[0] !== "*" && (o = parseInt(a[0], 10) + r);
        let h = parseInt(a[1], 10);
        this.validateNotNaN(h, "CronPattern: Syntax error, illegal stepping: (NaN)"), this.validateRange(0, this[t].length - 1, h, t, e);
        for(let l = o; l < this[t].length; l += h)this.setPart(t, l, i[1] || n);
    }
    replaceAlphaDays(e) {
        return e.replace(/-sun/gi, "-7").replace(/sun/gi, "0").replace(/mon/gi, "1").replace(/tue/gi, "2").replace(/wed/gi, "3").replace(/thu/gi, "4").replace(/fri/gi, "5").replace(/sat/gi, "6");
    }
    replaceAlphaDaysQuartz(e) {
        return e.replace(/sun/gi, "1").replace(/mon/gi, "2").replace(/tue/gi, "3").replace(/wed/gi, "4").replace(/thu/gi, "5").replace(/fri/gi, "6").replace(/sat/gi, "7");
    }
    replaceAlphaMonths(e) {
        return e.replace(/jan/gi, "1").replace(/feb/gi, "2").replace(/mar/gi, "3").replace(/apr/gi, "4").replace(/may/gi, "5").replace(/jun/gi, "6").replace(/jul/gi, "7").replace(/aug/gi, "8").replace(/sep/gi, "9").replace(/oct/gi, "10").replace(/nov/gi, "11").replace(/dec/gi, "12");
    }
    handleNicknames(e) {
        let t = e.trim().toLowerCase();
        if (t === "@yearly" || t === "@annually") return "0 0 1 1 *";
        if (t === "@monthly") return "0 0 1 * *";
        if (t === "@weekly") return "0 0 * * 0";
        if (t === "@daily" || t === "@midnight") return "0 0 * * *";
        if (t === "@hourly") return "0 * * * *";
        if (t === "@reboot") throw new TypeError("CronPattern: @reboot is not supported in this environment. This is an event-based trigger that requires system startup detection.");
        return e;
    }
    setNthWeekdayOfMonth(e, t) {
        if (typeof t != "number" && t.toUpperCase() === "L") this.dayOfWeek[e] = this.dayOfWeek[e] | 32;
        else if (t === 63) this.dayOfWeek[e] = 63;
        else if (t < 6 && t > 0) this.dayOfWeek[e] = this.dayOfWeek[e] | N[t - 1];
        else throw new TypeError(`CronPattern: nth weekday out of range, should be 1-5 or L. Value: ${t}, Type: ${typeof t}`);
    }
};
var M = [
    31,
    28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31
], f = [
    [
        "month",
        "year",
        0
    ],
    [
        "day",
        "month",
        -1
    ],
    [
        "hour",
        "day",
        0
    ],
    [
        "minute",
        "hour",
        0
    ],
    [
        "second",
        "minute",
        0
    ]
], m = class s {
    tz;
    ms;
    second;
    minute;
    hour;
    day;
    month;
    year;
    constructor(e, t){
        if (this.tz = t, e && e instanceof Date) if (!isNaN(e)) this.fromDate(e);
        else throw new TypeError("CronDate: Invalid date passed to CronDate constructor");
        else if (e == null) this.fromDate(new Date);
        else if (e && typeof e == "string") this.fromString(e);
        else if (e instanceof s) this.fromCronDate(e);
        else throw new TypeError("CronDate: Invalid type (" + typeof e + ") passed to CronDate constructor");
    }
    getLastDayOfMonth(e, t) {
        return t !== 1 ? M[t] : new Date(Date.UTC(e, t + 1, 0)).getUTCDate();
    }
    getLastWeekday(e, t) {
        let r = this.getLastDayOfMonth(e, t), i = new Date(Date.UTC(e, t, r)).getUTCDay();
        return i === 0 ? r - 2 : i === 6 ? r - 1 : r;
    }
    getNearestWeekday(e, t, r) {
        let n = this.getLastDayOfMonth(e, t);
        if (r > n) return -1;
        let a = new Date(Date.UTC(e, t, r)).getUTCDay();
        return a === 0 ? r === n ? r - 2 : r + 1 : a === 6 ? r === 1 ? r + 2 : r - 1 : r;
    }
    isNthWeekdayOfMonth(e, t, r, n) {
        let a = new Date(Date.UTC(e, t, r)).getUTCDay(), o = 0;
        for(let h = 1; h <= r; h++)new Date(Date.UTC(e, t, h)).getUTCDay() === a && o++;
        if (n & 63 && N[o - 1] & n) return !0;
        if (n & 32) {
            let h = this.getLastDayOfMonth(e, t);
            for(let l = r + 1; l <= h; l++)if (new Date(Date.UTC(e, t, l)).getUTCDay() === a) return !1;
            return !0;
        }
        return !1;
    }
    fromDate(e) {
        if (this.tz !== void 0) if (typeof this.tz == "number") this.ms = e.getUTCMilliseconds(), this.second = e.getUTCSeconds(), this.minute = e.getUTCMinutes() + this.tz, this.hour = e.getUTCHours(), this.day = e.getUTCDate(), this.month = e.getUTCMonth(), this.year = e.getUTCFullYear(), this.apply();
        else try {
            let t = g(e, this.tz);
            this.ms = e.getMilliseconds(), this.second = t.s, this.minute = t.i, this.hour = t.h, this.day = t.d, this.month = t.m - 1, this.year = t.y;
        } catch (t) {
            let r = t instanceof Error ? t.message : String(t);
            throw new TypeError(`CronDate: Failed to convert date to timezone '${this.tz}'. This may happen with invalid timezone names or dates. Original error: ${r}`);
        }
        else this.ms = e.getMilliseconds(), this.second = e.getSeconds(), this.minute = e.getMinutes(), this.hour = e.getHours(), this.day = e.getDate(), this.month = e.getMonth(), this.year = e.getFullYear();
    }
    fromCronDate(e) {
        this.tz = e.tz, this.year = e.year, this.month = e.month, this.day = e.day, this.hour = e.hour, this.minute = e.minute, this.second = e.second, this.ms = e.ms;
    }
    apply() {
        if (this.month > 11 || this.month < 0 || this.day > M[this.month] || this.day < 1 || this.hour > 59 || this.minute > 59 || this.second > 59 || this.hour < 0 || this.minute < 0 || this.second < 0) {
            let e = new Date(Date.UTC(this.year, this.month, this.day, this.hour, this.minute, this.second, this.ms));
            return this.ms = e.getUTCMilliseconds(), this.second = e.getUTCSeconds(), this.minute = e.getUTCMinutes(), this.hour = e.getUTCHours(), this.day = e.getUTCDate(), this.month = e.getUTCMonth(), this.year = e.getUTCFullYear(), !0;
        } else return !1;
    }
    fromString(e) {
        if (typeof this.tz == "number") {
            let t = k(e);
            this.ms = t.getUTCMilliseconds(), this.second = t.getUTCSeconds(), this.minute = t.getUTCMinutes(), this.hour = t.getUTCHours(), this.day = t.getUTCDate(), this.month = t.getUTCMonth(), this.year = t.getUTCFullYear(), this.apply();
        } else return this.fromDate(k(e, this.tz));
    }
    findNext(e, t, r, n) {
        return this._findMatch(e, t, r, n, 1);
    }
    _findMatch(e, t, r, n, i) {
        let a = this[t], o;
        r.lastDayOfMonth && (o = this.getLastDayOfMonth(this.year, this.month));
        let h = !r.starDOW && t == "day" ? new Date(Date.UTC(this.year, this.month, 1, 0, 0, 0, 0)).getUTCDay() : void 0, l = this[t] + n, y = i === 1 ? (u)=>u < r[t].length : (u)=>u >= 0;
        for(let u = l; y(u); u += i){
            let d = r[t][u];
            if (t === "day" && !d) {
                for(let c = 0; c < r.nearestWeekdays.length; c++)if (r.nearestWeekdays[c]) {
                    let _ = this.getNearestWeekday(this.year, this.month, c - n);
                    if (_ === -1) continue;
                    if (_ === u - n) {
                        d = 1;
                        break;
                    }
                }
            }
            if (t === "day" && r.lastWeekday) {
                let c = this.getLastWeekday(this.year, this.month);
                u - n === c && (d = 1);
            }
            if (t === "day" && r.lastDayOfMonth && u - n == o && (d = 1), t === "day" && !r.starDOW) {
                let c = r.dayOfWeek[(h + (u - n - 1)) % 7];
                if (c && c & 63) c = this.isNthWeekdayOfMonth(this.year, this.month, u - n, c) ? 1 : 0;
                else if (c) throw new Error(`CronDate: Invalid value for dayOfWeek encountered. ${c}`);
                r.useAndLogic ? d = d && c : !e.domAndDow && !r.starDOM ? d = d || c : d = d && c;
            }
            if (d) return this[t] = u - n, a !== this[t] ? 2 : 1;
        }
        return 3;
    }
    recurse(e, t, r) {
        if (r === 0 && !e.starYear) {
            if (this.year >= 0 && this.year < e.year.length && e.year[this.year] === 0) {
                let i = -1;
                for(let a = this.year + 1; a < e.year.length && a < 1e4; a++)if (e.year[a] === 1) {
                    i = a;
                    break;
                }
                if (i === -1) return null;
                this.year = i, this.month = 0, this.day = 1, this.hour = 0, this.minute = 0, this.second = 0, this.ms = 0;
            }
            if (this.year >= 1e4) return null;
        }
        let n = this.findNext(t, f[r][0], e, f[r][2]);
        if (n > 1) {
            let i = r + 1;
            for(; i < f.length;)this[f[i][0]] = -f[i][2], i++;
            if (n === 3) {
                if (this[f[r][1]]++, this[f[r][0]] = -f[r][2], this.apply(), r === 0 && !e.starYear) {
                    for(; this.year >= 0 && this.year < e.year.length && e.year[this.year] === 0 && this.year < 1e4;)this.year++;
                    if (this.year >= 1e4 || this.year >= e.year.length) return null;
                }
                return this.recurse(e, t, 0);
            } else if (this.apply()) return this.recurse(e, t, r - 1);
        }
        return r += 1, r >= f.length ? this : (e.starYear ? this.year >= 3e3 : this.year >= 1e4) ? null : this.recurse(e, t, r);
    }
    increment(e, t, r) {
        return this.second += t.interval !== void 0 && t.interval > 1 && r ? t.interval : 1, this.ms = 0, this.apply(), this.recurse(e, t, 0);
    }
    decrement(e, t) {
        return this.second -= t.interval !== void 0 && t.interval > 1 ? t.interval : 1, this.ms = 0, this.apply(), this.recurseBackward(e, t, 0, 0);
    }
    recurseBackward(e, t, r, n = 0) {
        if (n > 1e4) return null;
        if (r === 0 && !e.starYear) {
            if (this.year >= 0 && this.year < e.year.length && e.year[this.year] === 0) {
                let a = -1;
                for(let o = this.year - 1; o >= 0; o--)if (e.year[o] === 1) {
                    a = o;
                    break;
                }
                if (a === -1) return null;
                this.year = a, this.month = 11, this.day = 31, this.hour = 23, this.minute = 59, this.second = 59, this.ms = 0;
            }
            if (this.year < 0) return null;
        }
        let i = this.findPrevious(t, f[r][0], e, f[r][2]);
        if (i > 1) {
            let a = r + 1;
            for(; a < f.length;){
                let o = f[a][0], h = f[a][2], l = this.getMaxPatternValue(o, e, h);
                this[o] = l, a++;
            }
            if (i === 3) {
                if (this[f[r][1]]--, r === 0) {
                    let y = this.getLastDayOfMonth(this.year, this.month);
                    this.day > y && (this.day = y);
                }
                if (r === 1) if (this.day <= 0) this.day = 1;
                else {
                    let y = this.year, u = this.month;
                    for(; u < 0;)u += 12, y--;
                    for(; u > 11;)u -= 12, y++;
                    let d = u !== 1 ? M[u] : new Date(Date.UTC(y, u + 1, 0)).getUTCDate();
                    this.day > d && (this.day = d);
                }
                this.apply();
                let o = f[r][0], h = f[r][2], l = this.getMaxPatternValue(o, e, h);
                if (o === "day") {
                    let y = this.getLastDayOfMonth(this.year, this.month);
                    this[o] = Math.min(l, y);
                } else this[o] = l;
                if (this.apply(), r === 0) {
                    let y = f[1][2], u = this.getMaxPatternValue("day", e, y), d = this.getLastDayOfMonth(this.year, this.month), c = Math.min(u, d);
                    c !== this.day && (this.day = c, this.hour = this.getMaxPatternValue("hour", e, f[2][2]), this.minute = this.getMaxPatternValue("minute", e, f[3][2]), this.second = this.getMaxPatternValue("second", e, f[4][2]));
                }
                if (r === 0 && !e.starYear) {
                    for(; this.year >= 0 && this.year < e.year.length && e.year[this.year] === 0;)this.year--;
                    if (this.year < 0) return null;
                }
                return this.recurseBackward(e, t, 0, n + 1);
            } else if (this.apply()) return this.recurseBackward(e, t, r - 1, n + 1);
        }
        return r += 1, r >= f.length ? this : this.year < 0 ? null : this.recurseBackward(e, t, r, n + 1);
    }
    getMaxPatternValue(e, t, r) {
        if (e === "day" && t.lastDayOfMonth) return this.getLastDayOfMonth(this.year, this.month);
        if (e === "day" && !t.starDOW) return this.getLastDayOfMonth(this.year, this.month);
        for(let n = t[e].length - 1; n >= 0; n--)if (t[e][n]) return n - r;
        return t[e].length - 1 - r;
    }
    findPrevious(e, t, r, n) {
        return this._findMatch(e, t, r, n, -1);
    }
    getDate(e) {
        return e || this.tz === void 0 ? new Date(this.year, this.month, this.day, this.hour, this.minute, this.second, this.ms) : typeof this.tz == "number" ? new Date(Date.UTC(this.year, this.month, this.day, this.hour, this.minute - this.tz, this.second, this.ms)) : O(w(this.year, this.month + 1, this.day, this.hour, this.minute, this.second, this.tz), !1);
    }
    getTime() {
        return this.getDate(!1).getTime();
    }
    match(e, t) {
        if (!e.starYear && (this.year < 0 || this.year >= e.year.length || e.year[this.year] === 0)) return !1;
        for(let r = 0; r < f.length; r++){
            let n = f[r][0], i = f[r][2], a = this[n];
            if (a + i < 0 || a + i >= e[n].length) return !1;
            let o = e[n][a + i];
            if (n === "day") {
                if (!o) {
                    for(let h = 0; h < e.nearestWeekdays.length; h++)if (e.nearestWeekdays[h]) {
                        let l = this.getNearestWeekday(this.year, this.month, h - i);
                        if (l !== -1 && l === a) {
                            o = 1;
                            break;
                        }
                    }
                }
                if (e.lastWeekday) {
                    let h = this.getLastWeekday(this.year, this.month);
                    a === h && (o = 1);
                }
                if (e.lastDayOfMonth) {
                    let h = this.getLastDayOfMonth(this.year, this.month);
                    a === h && (o = 1);
                }
                if (!e.starDOW) {
                    let h = new Date(Date.UTC(this.year, this.month, 1, 0, 0, 0, 0)).getUTCDay(), l = e.dayOfWeek[(h + (a - 1)) % 7];
                    l && l & 63 && (l = this.isNthWeekdayOfMonth(this.year, this.month, a, l) ? 1 : 0), e.useAndLogic ? o = o && l : !t.domAndDow && !e.starDOM ? o = o || l : o = o && l;
                }
            }
            if (!o) return !1;
        }
        return !0;
    }
};
function x(s) {
    if (s === void 0 && (s = {}), delete s.name, s.legacyMode !== void 0 && s.domAndDow === void 0 ? s.domAndDow = !s.legacyMode : s.domAndDow === void 0 && (s.domAndDow = !1), s.legacyMode = !s.domAndDow, s.paused = s.paused === void 0 ? !1 : s.paused, s.maxRuns = s.maxRuns === void 0 ? 1 / 0 : s.maxRuns, s.catch = s.catch === void 0 ? !1 : s.catch, s.interval = s.interval === void 0 ? 0 : parseInt(s.interval.toString(), 10), s.utcOffset = s.utcOffset === void 0 ? void 0 : parseInt(s.utcOffset.toString(), 10), s.dayOffset = s.dayOffset === void 0 ? 0 : parseInt(s.dayOffset.toString(), 10), s.unref = s.unref === void 0 ? !1 : s.unref, s.mode = s.mode === void 0 ? "auto" : s.mode, s.alternativeWeekdays = s.alternativeWeekdays === void 0 ? !1 : s.alternativeWeekdays, s.sloppyRanges = s.sloppyRanges === void 0 ? !1 : s.sloppyRanges, ![
        "auto",
        "5-part",
        "6-part",
        "7-part",
        "5-or-6-parts",
        "6-or-7-parts"
    ].includes(s.mode)) throw new Error("CronOptions: mode must be one of 'auto', '5-part', '6-part', '7-part', '5-or-6-parts', or '6-or-7-parts'.");
    if (s.startAt && (s.startAt = new m(s.startAt, s.timezone)), s.stopAt && (s.stopAt = new m(s.stopAt, s.timezone)), s.interval !== null) {
        if (isNaN(s.interval)) throw new Error("CronOptions: Supplied value for interval is not a number");
        if (s.interval < 0) throw new Error("CronOptions: Supplied value for interval can not be negative");
    }
    if (s.utcOffset !== void 0) {
        if (isNaN(s.utcOffset)) throw new Error("CronOptions: Invalid value passed for utcOffset, should be number representing minutes offset from UTC.");
        if (s.utcOffset < -870 || s.utcOffset > 870) throw new Error("CronOptions: utcOffset out of bounds.");
        if (s.utcOffset !== void 0 && s.timezone) throw new Error("CronOptions: Combining 'utcOffset' with 'timezone' is not allowed.");
    }
    if (s.unref !== !0 && s.unref !== !1) throw new Error("CronOptions: Unref should be either true, false or undefined(false).");
    if (s.dayOffset !== void 0 && s.dayOffset !== 0 && isNaN(s.dayOffset)) throw new Error("CronOptions: Invalid value passed for dayOffset, should be a number representing days to offset.");
    return s;
}
function T(s) {
    return Object.prototype.toString.call(s) === "[object Function]" || typeof s == "function" || s instanceof Function;
}
function W(s) {
    return T(s);
}
function E(s) {
    typeof Deno < "u" && typeof Deno.unrefTimer < "u" ? Deno.unrefTimer(s) : s && typeof s.unref < "u" && s.unref();
}
var A = 30 * 1e3, b = [], R = class {
    name;
    options;
    _states;
    fn;
    getTz() {
        return this.options.timezone || this.options.utcOffset;
    }
    applyDayOffset(e) {
        if (this.options.dayOffset !== void 0 && this.options.dayOffset !== 0) {
            let t = this.options.dayOffset * 24 * 60 * 60 * 1e3;
            return new Date(e.getTime() + t);
        }
        return e;
    }
    constructor(e, t, r){
        let n, i;
        if (T(t)) i = t;
        else if (typeof t == "object") n = t;
        else if (t !== void 0) throw new Error("Cron: Invalid argument passed for optionsIn. Should be one of function, or object (options).");
        if (T(r)) i = r;
        else if (typeof r == "object") n = r;
        else if (r !== void 0) throw new Error("Cron: Invalid argument passed for funcIn. Should be one of function, or object (options).");
        if (this.name = n?.name, this.options = x(n), this._states = {
            kill: !1,
            blocking: !1,
            previousRun: void 0,
            currentRun: void 0,
            once: void 0,
            currentTimeout: void 0,
            maxRuns: n ? n.maxRuns : void 0,
            paused: n ? n.paused : !1,
            pattern: new p("* * * * *", void 0, {
                mode: "auto"
            })
        }, e && (e instanceof Date || typeof e == "string" && e.indexOf(":") > 0) ? this._states.once = new m(e, this.getTz()) : this._states.pattern = new p(e, this.options.timezone, {
            mode: this.options.mode,
            alternativeWeekdays: this.options.alternativeWeekdays,
            sloppyRanges: this.options.sloppyRanges
        }), this.name) {
            if (b.find((o)=>o.name === this.name)) throw new Error("Cron: Tried to initialize new named job '" + this.name + "', but name already taken.");
            b.push(this);
        }
        return i !== void 0 && W(i) && (this.fn = i, this.schedule()), this;
    }
    nextRun(e) {
        let t = this._next(e);
        return t ? this.applyDayOffset(t.getDate(!1)) : null;
    }
    nextRuns(e, t) {
        this._states.maxRuns !== void 0 && e > this._states.maxRuns && (e = this._states.maxRuns);
        let r = t || this._states.currentRun || void 0;
        return this._enumerateRuns(e, r, "next");
    }
    previousRuns(e, t) {
        return this._enumerateRuns(e, t || void 0, "previous");
    }
    _enumerateRuns(e, t, r) {
        let n = [], i = t ? new m(t, this.getTz()) : null, a = r === "next" ? this._next : this._previous;
        for(; e--;){
            let o = a.call(this, i);
            if (!o) break;
            let h = o.getDate(!1);
            n.push(this.applyDayOffset(h)), i = o;
        }
        return n;
    }
    match(e) {
        if (this._states.once) {
            let r = new m(e, this.getTz());
            r.ms = 0;
            let n = new m(this._states.once, this.getTz());
            return n.ms = 0, r.getTime() === n.getTime();
        }
        let t = new m(e, this.getTz());
        return t.ms = 0, t.match(this._states.pattern, this.options);
    }
    getPattern() {
        if (!this._states.once) return this._states.pattern ? this._states.pattern.pattern : void 0;
    }
    getOnce() {
        return this._states.once ? this._states.once.getDate() : null;
    }
    isRunning() {
        let e = this.nextRun(this._states.currentRun), t = !this._states.paused, r = this.fn !== void 0, n = !this._states.kill;
        return t && r && n && e !== null;
    }
    isStopped() {
        return this._states.kill;
    }
    isBusy() {
        return this._states.blocking;
    }
    currentRun() {
        return this._states.currentRun ? this._states.currentRun.getDate() : null;
    }
    previousRun() {
        return this._states.previousRun ? this._states.previousRun.getDate() : null;
    }
    msToNext(e) {
        let t = this._next(e);
        return t ? e instanceof m || e instanceof Date ? t.getTime() - e.getTime() : t.getTime() - new m(e).getTime() : null;
    }
    stop() {
        this._states.kill = !0, this._states.currentTimeout && clearTimeout(this._states.currentTimeout);
        let e = b.indexOf(this);
        e >= 0 && b.splice(e, 1);
    }
    pause() {
        return this._states.paused = !0, !this._states.kill;
    }
    resume() {
        return this._states.paused = !1, !this._states.kill;
    }
    schedule(e) {
        if (e && this.fn) throw new Error("Cron: It is not allowed to schedule two functions using the same Croner instance.");
        e && (this.fn = e);
        let t = this.msToNext(), r = this.nextRun(this._states.currentRun);
        return t == null || isNaN(t) || r === null ? this : (t > A && (t = A), this._states.currentTimeout = setTimeout(()=>this._checkTrigger(r), t), this._states.currentTimeout && this.options.unref && E(this._states.currentTimeout), this);
    }
    async _trigger(e) {
        this._states.blocking = !0, this._states.currentRun = new m(void 0, this.getTz());
        try {
            if (this.options.catch) try {
                this.fn !== void 0 && await this.fn(this, this.options.context);
            } catch (t) {
                if (T(this.options.catch)) try {
                    this.options.catch(t, this);
                } catch  {}
            }
            else this.fn !== void 0 && await this.fn(this, this.options.context);
        } finally{
            this._states.previousRun = new m(e, this.getTz()), this._states.blocking = !1;
        }
    }
    async trigger() {
        await this._trigger();
    }
    runsLeft() {
        return this._states.maxRuns;
    }
    _checkTrigger(e) {
        let t = new Date, r = !this._states.paused && t.getTime() >= e.getTime(), n = this._states.blocking && this.options.protect;
        r && !n ? (this._states.maxRuns !== void 0 && this._states.maxRuns--, this._trigger()) : r && n && T(this.options.protect) && setTimeout(()=>this.options.protect(this), 0), this.schedule();
    }
    _next(e) {
        let t = !!(e || this._states.currentRun), r = !1;
        !e && this.options.startAt && this.options.interval && ([e, t] = this._calculatePreviousRun(e, t), r = !e), e = new m(e, this.getTz()), this.options.startAt && e && e.getTime() < this.options.startAt.getTime() && (e = this.options.startAt);
        let n = this._states.once || new m(e, this.getTz());
        return !r && n !== this._states.once && (n = n.increment(this._states.pattern, this.options, t)), this._states.once && this._states.once.getTime() <= e.getTime() || n === null || this._states.maxRuns !== void 0 && this._states.maxRuns <= 0 || this._states.kill || this.options.stopAt && n.getTime() >= this.options.stopAt.getTime() ? null : n;
    }
    _previous(e) {
        let t = new m(e, this.getTz());
        this.options.stopAt && t.getTime() > this.options.stopAt.getTime() && (t = this.options.stopAt);
        let r = new m(t, this.getTz());
        return this._states.once ? this._states.once.getTime() < t.getTime() ? this._states.once : null : (r = r.decrement(this._states.pattern, this.options), r === null || this.options.startAt && r.getTime() < this.options.startAt.getTime() ? null : r);
    }
    _calculatePreviousRun(e, t) {
        let r = new m(void 0, this.getTz()), n = e;
        if (this.options.startAt.getTime() <= r.getTime()) {
            n = this.options.startAt;
            let i = n.getTime() + this.options.interval * 1e3;
            for(; i <= r.getTime();)n = new m(n, this.getTz()).increment(this._states.pattern, this.options, !0), i = n.getTime() + this.options.interval * 1e3;
            t = !0;
        }
        return n === null && (n = void 0), [
            n,
            t
        ];
    }
};
0 && (module.exports = {
    Cron,
    CronDate,
    CronPattern,
    scheduledJobs
});
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@neatlogs+instrumentation-mastra@0.1.2_edb8190726b9c0715a2b14c366f33bbd/node_modules/@neatlogs/instrumentation-mastra/dist/esm/instrumentation.js [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Neatlogs instrumentation for @mastra/core.
 *
 * Implements Mastra's ObservabilityBridge interface to create OTel spans at
 * Mastra span construction time and propagate OTel context into step executions.
 * This enables `trace()` calls inside Mastra workflow steps to inherit the
 * workflow's trace ID and parent correctly.
 *
 * Usage (via neatlogs SDK):
 *   neatlogs.init({ instrumentations: ['mastra'] })
 *
 * Usage (standalone):
 *   import MastraInstrumentor from '@neatlogs/instrumentation-mastra';
 *   const instr = new MastraInstrumentor();
 *   instr.instrument({ tracerProvider: myProvider });
 */ __turbopack_context__.s([
    "MastraInstrumentor",
    ()=>MastraInstrumentor,
    "NeatlogsMastraBridge",
    ()=>NeatlogsMastraBridge,
    "NeatlogsMastraExporter",
    ()=>NeatlogsMastraExporter,
    "createNeatlogsMastraObservability",
    ()=>createNeatlogsMastraObservability,
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2f$span_kind$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@opentelemetry+api@1.9.1/node_modules/@opentelemetry/api/build/esm/trace/span_kind.js [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2f$status$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@opentelemetry+api@1.9.1/node_modules/@opentelemetry/api/build/esm/trace/status.js [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2d$api$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@opentelemetry+api@1.9.1/node_modules/@opentelemetry/api/build/esm/trace-api.js [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$context$2d$api$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@opentelemetry+api@1.9.1/node_modules/@opentelemetry/api/build/esm/context-api.js [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2f$spancontext$2d$utils$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@opentelemetry+api@1.9.1/node_modules/@opentelemetry/api/build/esm/trace/spancontext-utils.js [instrumentation] (ecmascript)");
;
// ---------------------------------------------------------------------------
// SpanType → OpenInference span kind mapping
// ---------------------------------------------------------------------------
const SPAN_TYPE_TO_OI_KIND = {
    // LLM spans
    model_generation: 'CHAIN',
    model_step: 'LLM',
    model_chunk: 'CHAIN',
    // Tool spans
    tool_call: 'TOOL',
    mcp_tool_call: 'TOOL',
    // Agent spans
    agent_run: 'AGENT',
    scorer_run: 'AGENT',
    // Workflow spans
    workflow_run: 'WORKFLOW',
    workflow_step: 'CHAIN',
    workflow_conditional: 'CHAIN',
    workflow_conditional_eval: 'CHAIN',
    workflow_parallel: 'CHAIN',
    workflow_loop: 'CHAIN',
    workflow_sleep: 'CHAIN',
    workflow_wait_event: 'CHAIN',
    // RAG spans
    rag_ingestion: 'RETRIEVER',
    rag_embedding: 'EMBEDDING',
    rag_vector_operation: 'RETRIEVER',
    rag_action: 'RETRIEVER',
    // Memory
    memory_operation: 'CHAIN',
    // Everything else
    generic: 'CHAIN',
    processor_run: 'CHAIN',
    workspace_action: 'CHAIN',
    graph_action: 'CHAIN',
    scorer_step: 'CHAIN'
};
function getOiKind(spanType) {
    return SPAN_TYPE_TO_OI_KIND[spanType] ?? 'CHAIN';
}
// ---------------------------------------------------------------------------
// Message conversion helpers
// ---------------------------------------------------------------------------
/**
 * Flatten a Mastra message array (from span.input or span.output on LLM spans)
 * into flat indexed OTel attributes:
 *   llm.input_messages.0.message.role
 *   llm.input_messages.0.message.content
 *   llm.input_messages.0.message.tool_calls.0.tool_call.function.name
 *   llm.input_messages.0.message.tool_calls.0.tool_call.function.arguments
 */ function flattenMessages(messages, prefix, setAttr) {
    if (!Array.isArray(messages)) return;
    messages.forEach((msg, i)=>{
        if (!msg || typeof msg !== 'object') return;
        const role = msg.role ?? 'user';
        setAttr(`${prefix}.${i}.message.role`, String(role));
        // Content: string or array of content parts
        if (typeof msg.content === 'string') {
            setAttr(`${prefix}.${i}.message.content`, msg.content);
        } else if (Array.isArray(msg.content)) {
            const textParts = msg.content.filter((p)=>p?.type === 'text' && p?.text).map((p)=>p.text).join('');
            if (textParts) {
                setAttr(`${prefix}.${i}.message.content`, textParts);
            }
        }
        // Tool calls (on assistant messages)
        if (Array.isArray(msg.toolCalls) || Array.isArray(msg.tool_calls)) {
            const toolCalls = msg.toolCalls ?? msg.tool_calls;
            toolCalls.forEach((tc, j)=>{
                const name = tc?.toolName ?? tc?.function?.name ?? tc?.name ?? '';
                const args = tc?.args ?? tc?.function?.arguments ?? tc?.arguments;
                if (name) {
                    setAttr(`${prefix}.${i}.message.tool_calls.${j}.tool_call.function.name`, String(name));
                }
                if (args !== undefined) {
                    setAttr(`${prefix}.${i}.message.tool_calls.${j}.tool_call.function.arguments`, typeof args === 'string' ? args : JSON.stringify(args));
                }
            });
        }
        // Tool result (on tool messages)
        if (role === 'tool' && msg.toolCallId) {
            setAttr(`${prefix}.${i}.tool_call_id`, String(msg.toolCallId));
        }
    });
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Best-effort warning to stderr/console; never throws. */ function _warn(msg) {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const g = globalThis;
        if (typeof g.process?.stderr?.write === 'function') {
            g.process.stderr.write(`[neatlogs] ${msg}\n`);
        } else if (typeof g.console?.warn === 'function') {
            g.console.warn(`[neatlogs] ${msg}`);
        }
    } catch  {}
}
function _safeStringify(value, maxLen = 100_000) {
    if (typeof value === 'string') return value.slice(0, maxLen);
    try {
        return JSON.stringify(value).slice(0, maxLen);
    } catch  {
        return String(value).slice(0, maxLen);
    }
}
class NeatlogsMastraBridge {
    name = 'neatlogs';
    _tracer;
    /**
     * Active spans keyed by OTel span ID (which equals Mastra span ID since
     * createSpan returns the OTel-generated IDs back to Mastra).
     */ _activeSpans = new Map();
    /** Model metadata inherited down from model_generation spans to their descendants. */ _modelInfo = new Map();
    constructor(tracerProvider){
        this._tracer = tracerProvider.getTracer('openinference.instrumentation.mastra');
    }
    // -------------------------------------------------------------------------
    // ObservabilityBridge: createSpan
    // -------------------------------------------------------------------------
    createSpan(options) {
        try {
            let parentContext = __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$context$2d$api$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["context"].active();
            // Walk up to find the nearest non-internal parent's OTel context
            const parentId = this._getExternalParentId(options);
            if (parentId) {
                const parentEntry = this._activeSpans.get(parentId);
                if (parentEntry) {
                    parentContext = parentEntry.context;
                }
            }
            const otelSpan = this._tracer.startSpan(options.name ?? 'mastra.span', {
                kind: __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2f$span_kind$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["SpanKind"].INTERNAL
            }, parentContext);
            const otelSpanContext = otelSpan.spanContext();
            if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2f$spancontext$2d$utils$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["isSpanContextValid"])(otelSpanContext)) {
                otelSpan.end();
                return undefined;
            }
            const spanId = otelSpanContext.spanId;
            const traceId = otelSpanContext.traceId;
            // Store with context that has this span as active
            const spanContext = __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2d$api$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["trace"].setSpan(parentContext, otelSpan);
            // Determine parentSpanId from parent context
            const parentSpan = __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2d$api$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["trace"].getSpan(parentContext);
            const parentSpanCtx = parentSpan?.spanContext();
            const parentSpanId = parentSpanCtx && (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2f$spancontext$2d$utils$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["isSpanContextValid"])(parentSpanCtx) ? parentSpanCtx.spanId : undefined;
            this._activeSpans.set(spanId, {
                span: otelSpan,
                context: spanContext,
                parentSpanId
            });
            // Store model info at creation time for model_generation spans
            if (options.type === 'model_generation') {
                const model = options.attributes?.model ?? this._extractModelFromName(options.name);
                const provider = options.attributes?.provider;
                if (model || provider) {
                    this._modelInfo.set(spanId, {
                        model,
                        provider
                    });
                }
            }
            return {
                traceId,
                spanId,
                parentSpanId
            };
        } catch  {
            return undefined;
        }
    }
    // -------------------------------------------------------------------------
    // ObservabilityBridge: executeInContext / executeInContextSync
    // -------------------------------------------------------------------------
    executeInContext(spanId, fn) {
        return this._executeWithSpanContext(spanId, fn);
    }
    executeInContextSync(spanId, fn) {
        return this._executeWithSpanContext(spanId, fn);
    }
    _executeWithSpanContext(spanId, fn) {
        const entry = this._activeSpans.get(spanId);
        if (entry) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$context$2d$api$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["context"].with(entry.context, fn);
        }
        return fn();
    }
    // -------------------------------------------------------------------------
    // ObservabilityBridge: exportTracingEvent (handles span_ended)
    // -------------------------------------------------------------------------
    async exportTracingEvent(event) {
        if (!event || event.type !== 'span_ended') return;
        try {
            this._handleSpanEnded(event.exportedSpan);
        } catch  {
        // best-effort
        }
    }
    onTracingEvent(event) {
        return this.exportTracingEvent(event);
    }
    _handleSpanEnded(mastraSpan) {
        if (!mastraSpan?.id) return;
        const entry = this._activeSpans.get(mastraSpan.id);
        if (!entry) return;
        this._activeSpans.delete(mastraSpan.id);
        this._modelInfo.delete(mastraSpan.id);
        this._finalizeSpan(entry.span, mastraSpan, entry.parentSpanId);
    }
    // -------------------------------------------------------------------------
    // Shared finalization (attributes, status, end)
    // -------------------------------------------------------------------------
    _finalizeSpan(otelSpan, mastraSpan, parentSpanId) {
        const type = mastraSpan.type ?? 'generic';
        const oiKind = getOiKind(type);
        otelSpan.setAttribute('openinference.span.kind', oiKind);
        if (mastraSpan.entityName) {
            otelSpan.setAttribute('mastra.entity.name', mastraSpan.entityName);
        }
        if (mastraSpan.entityType) {
            otelSpan.setAttribute('mastra.entity.type', mastraSpan.entityType);
        }
        // Store/update model info from model_generation spans for descendant inheritance
        const attrs = mastraSpan.attributes ?? {};
        if (type === 'model_generation' && (attrs.model || attrs.responseModel || attrs.provider || attrs.metadata || mastraSpan.metadata)) {
            let model = attrs.responseModel;
            if (!model) {
                const metaSources = [
                    mastraSpan.metadata,
                    attrs.metadata
                ];
                for (const raw of metaSources){
                    if (!raw) continue;
                    try {
                        const meta = typeof raw === 'string' ? JSON.parse(raw) : raw;
                        if (meta?.body?.model) {
                            model = meta.body.model;
                            break;
                        }
                    } catch (e) {
                        console.warn('[neatlogs-mastra] Failed to parse metadata for model inheritance:', e);
                    }
                }
            }
            model = model ?? attrs.model;
            this._modelInfo.set(mastraSpan.id, {
                model,
                provider: attrs.provider
            });
        }
        // Set chunk type as attribute for UI context
        if (type === 'model_chunk') {
            const chunkType = mastraSpan.attributes?.chunkType;
            if (chunkType) {
                otelSpan.setAttribute('mastra.chunk.type', chunkType);
            }
        }
        this._setTypeAttributes(otelSpan, mastraSpan, parentSpanId);
        this._setInputOutput(otelSpan, mastraSpan);
        if (mastraSpan.errorInfo) {
            otelSpan.setStatus({
                code: __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2f$status$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["SpanStatusCode"].ERROR,
                message: mastraSpan.errorInfo.message
            });
            otelSpan.recordException(new Error(mastraSpan.errorInfo.message));
        } else {
            otelSpan.setStatus({
                code: __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2f$status$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["SpanStatusCode"].OK
            });
        }
        if (mastraSpan.metadata && Object.keys(mastraSpan.metadata).length > 0) {
            try {
                otelSpan.setAttribute('metadata', JSON.stringify(mastraSpan.metadata));
            } catch  {
            // best-effort
            }
        }
        if (Array.isArray(mastraSpan.tags) && mastraSpan.tags.length > 0) {
            otelSpan.setAttribute('tag.tags', mastraSpan.tags);
        }
        // Update name if Mastra renamed the span after creation
        if (mastraSpan.name) {
            otelSpan.updateName(mastraSpan.name);
        }
        otelSpan.end(mastraSpan.endTime ? new Date(mastraSpan.endTime).getTime() : undefined);
    }
    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------
    /** Walk up the parent chain to find the nearest ancestor with model info. */ _resolveModelInfo(spanId) {
        let current = spanId;
        const visited = new Set();
        while(current && !visited.has(current)){
            visited.add(current);
            const info = this._modelInfo.get(current);
            if (info) return info;
            const entry = this._activeSpans.get(current);
            current = entry?.parentSpanId;
        }
        return undefined;
    }
    /** Extract model name from span names like "llm: 'gpt-5-nano'" */ _extractModelFromName(name) {
        if (!name) return undefined;
        const match = name.match(/^llm:\s*'([^']+)'/);
        return match?.[1];
    }
    _getExternalParentId(options) {
        if (!options.parent) return undefined;
        if (options.parent.isInternal) {
            return options.parent.getParentSpanId?.(false) ?? options.parent.id;
        }
        return options.parent.id;
    }
    /** Returns the number of currently active (started but not ended) spans. */ get activeSpanCount() {
        return this._activeSpans.size;
    }
    _setTypeAttributes(otelSpan, span, parentSpanId) {
        const attrs = span.attributes ?? {};
        const type = span.type ?? '';
        if (type === 'model_generation' || type === 'model_step') {
            // Extract the actual model name from the API response metadata.
            // Mastra puts response metadata in span.metadata (top-level), which contains
            // the response body with the resolved model name (e.g., "gpt-5-nano-2025-08-07"
            // instead of the deployment name "gpt-5-nano").
            let responseModel = attrs.responseModel;
            if (!responseModel) {
                const metaSources = [
                    span.metadata,
                    attrs.metadata
                ];
                for (const raw of metaSources){
                    if (!raw) continue;
                    try {
                        const meta = typeof raw === 'string' ? JSON.parse(raw) : raw;
                        if (meta?.body?.model) {
                            responseModel = meta.body.model;
                            break;
                        }
                    } catch (e) {
                        console.warn('[neatlogs-mastra] Failed to parse metadata for model extraction:', e);
                    }
                }
            }
            const inherited = this._resolveModelInfo(parentSpanId);
            const resolvedModel = responseModel ?? inherited?.model ?? attrs.model;
            const provider = attrs.provider ?? inherited?.provider;
            if (attrs.model) {
                otelSpan.setAttribute('gen_ai.request.model', attrs.model);
            }
            if (resolvedModel) {
                otelSpan.setAttribute('llm.model_name', resolvedModel);
            }
            if (responseModel) {
                otelSpan.setAttribute('gen_ai.response.model', responseModel);
            } else if (inherited?.model) {
                otelSpan.setAttribute('gen_ai.response.model', inherited.model);
            }
            if (provider) {
                otelSpan.setAttribute('gen_ai.system', provider);
                otelSpan.setAttribute('llm.provider', provider);
            }
            if (attrs.finishReason) {
                otelSpan.setAttribute('llm.response.finish_reason', attrs.finishReason);
            }
            // Only emit token counts on model_step (per-call canonical spans).
            // model_generation carries the aggregated total across all steps — emitting
            // it would cause double-counting in cost calculation since the backend sums
            // tokens from all LLM spans in a trace.
            if (type === 'model_step') {
                const usage = attrs.usage;
                if (usage) {
                    if (usage.inputTokens !== undefined) {
                        otelSpan.setAttribute('llm.token_count.prompt', usage.inputTokens);
                    }
                    if (usage.outputTokens !== undefined) {
                        otelSpan.setAttribute('llm.token_count.completion', usage.outputTokens);
                    }
                    if (usage.inputTokens !== undefined && usage.outputTokens !== undefined) {
                        otelSpan.setAttribute('llm.token_count.total', usage.inputTokens + usage.outputTokens);
                    }
                    const inputDetails = usage.inputDetails;
                    if (inputDetails) {
                        if (inputDetails.cacheRead !== undefined) {
                            otelSpan.setAttribute('llm.token_count.prompt_details.cache_read', inputDetails.cacheRead);
                        }
                        if (inputDetails.cacheWrite !== undefined) {
                            otelSpan.setAttribute('llm.token_count.prompt_details.cache_write', inputDetails.cacheWrite);
                        }
                        if (inputDetails.audio !== undefined) {
                            otelSpan.setAttribute('llm.token_count.prompt_details.audio', inputDetails.audio);
                        }
                    }
                    const outputDetails = usage.outputDetails;
                    if (outputDetails) {
                        if (outputDetails.reasoning !== undefined) {
                            otelSpan.setAttribute('llm.token_count.completion_details.reasoning', outputDetails.reasoning);
                        }
                        if (outputDetails.audio !== undefined) {
                            otelSpan.setAttribute('llm.token_count.completion_details.audio', outputDetails.audio);
                        }
                    }
                }
            }
            if (attrs.parameters) {
                try {
                    otelSpan.setAttribute('llm.invocation_parameters', JSON.stringify(attrs.parameters));
                } catch  {
                // best-effort
                }
            }
            if (attrs.completionStartTime && span.startTime) {
                const completionStart = new Date(attrs.completionStartTime).getTime();
                const ttft = completionStart - new Date(span.startTime).getTime();
                if (ttft >= 0) {
                    otelSpan.setAttribute('mastra.completion_start_time', new Date(attrs.completionStartTime).toISOString());
                    otelSpan.setAttribute('llm.time_to_first_token', ttft);
                }
            }
        }
        if (type === 'agent_run') {
            if (attrs.conversationId) {
                otelSpan.setAttribute('session.id', attrs.conversationId);
            }
            if (attrs.instructions) {
                otelSpan.setAttribute('llm.system', attrs.instructions);
            }
            if (Array.isArray(attrs.availableTools) && attrs.availableTools.length > 0) {
                otelSpan.setAttribute('mastra.agent.available_tools', attrs.availableTools.join(','));
            }
        }
        if (type === 'tool_call' || type === 'mcp_tool_call') {
            if (span.name) {
                otelSpan.setAttribute('tool.name', span.name);
            }
            if (attrs.toolDescription) {
                otelSpan.setAttribute('tool.description', attrs.toolDescription);
            }
            if (type === 'mcp_tool_call' && attrs.mcpServer) {
                otelSpan.setAttribute('mastra.mcp.server', attrs.mcpServer);
            }
        }
        if (type === 'rag_embedding') {
            if (attrs.model) {
                otelSpan.setAttribute('embedding.model_name', attrs.model);
            }
            if (attrs.provider) {
                otelSpan.setAttribute('gen_ai.system', attrs.provider);
            }
            const usage = attrs.usage;
            if (usage?.inputTokens !== undefined) {
                otelSpan.setAttribute('llm.token_count.prompt', usage.inputTokens);
            }
        }
    }
    _setInputOutput(otelSpan, span) {
        const type = span.type ?? '';
        const hasStructuredMessages = type === 'model_generation' || type === 'model_step';
        if (hasStructuredMessages) {
            const input = type === 'model_generation' && span.input?.messages ? span.input.messages : span.input;
            if (Array.isArray(input) && input.length > 0) {
                flattenMessages(input, 'llm.input_messages', (k, v)=>otelSpan.setAttribute(k, v));
            } else if (input !== undefined && input !== null) {
                otelSpan.setAttribute('input.value', _safeStringify(input));
            }
            if (Array.isArray(span.output) && span.output.length > 0) {
                flattenMessages(span.output, 'llm.output_messages', (k, v)=>otelSpan.setAttribute(k, v));
            } else if (span.output !== undefined && span.output !== null) {
                otelSpan.setAttribute('output.value', _safeStringify(span.output));
            }
        } else {
            const isTool = type === 'tool_call' || type === 'mcp_tool_call';
            const oiKind = getOiKind(type);
            if (span.input !== undefined && span.input !== null) {
                const inputStr = _safeStringify(span.input);
                otelSpan.setAttribute('input.value', inputStr);
                if (isTool) {
                    otelSpan.setAttribute('tool.input', inputStr);
                    otelSpan.setAttribute('neatlogs.tool.input', inputStr);
                } else if (oiKind === 'CHAIN') {
                    otelSpan.setAttribute('chain.input', inputStr);
                    otelSpan.setAttribute('neatlogs.chain.input', inputStr);
                } else if (oiKind === 'WORKFLOW') {
                    otelSpan.setAttribute('workflow.input', inputStr);
                    otelSpan.setAttribute('neatlogs.workflow.input', inputStr);
                } else if (oiKind === 'AGENT') {
                    otelSpan.setAttribute('agent.input', inputStr);
                    otelSpan.setAttribute('neatlogs.agent.input', inputStr);
                }
            }
            if (span.output !== undefined && span.output !== null) {
                const outputStr = _safeStringify(span.output);
                otelSpan.setAttribute('output.value', outputStr);
                if (isTool) {
                    otelSpan.setAttribute('tool.output', outputStr);
                    otelSpan.setAttribute('neatlogs.tool.output', outputStr);
                } else if (oiKind === 'CHAIN') {
                    otelSpan.setAttribute('chain.output', outputStr);
                    otelSpan.setAttribute('neatlogs.chain.output', outputStr);
                } else if (oiKind === 'WORKFLOW') {
                    otelSpan.setAttribute('workflow.output', outputStr);
                    otelSpan.setAttribute('neatlogs.workflow.output', outputStr);
                } else if (oiKind === 'AGENT') {
                    otelSpan.setAttribute('agent.output', outputStr);
                    otelSpan.setAttribute('neatlogs.agent.output', outputStr);
                }
            }
        }
    }
    async flush() {
    // No-op — active spans should not be ended on flush
    }
    async shutdown() {
        for (const [_id, entry] of this._activeSpans){
            try {
                entry.span.setStatus({
                    code: __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2f$status$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["SpanStatusCode"].UNSET
                });
                entry.span.end();
            } catch  {
            // best-effort
            }
        }
        this._activeSpans.clear();
    }
    init(_options) {}
    __setLogger(_logger) {}
}
const NeatlogsMastraExporter = NeatlogsMastraBridge;
async function createNeatlogsMastraObservability(tracerProvider, options) {
    const obsModule = options?._observabilityModule ?? await __turbopack_context__.A("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@mastra+observability@1.12.0_@mastra+core@1.35.0_@standard-community+standard-json@0.3._9fd8ab557089c613f1536d8ab0981b60/node_modules/@mastra/observability/dist/index.js [instrumentation] (ecmascript, async loader)");
    const Observability = obsModule?.Observability ?? obsModule?.default?.Observability;
    if (typeof Observability !== 'function') {
        throw new Error('@mastra/observability does not export a valid Observability constructor');
    }
    const bridge = options?.bridge ?? options?.exporter ?? new NeatlogsMastraBridge(tracerProvider);
    const observability = new Observability({
        configs: {
            default: {
                serviceName: 'mastra',
                bridge
            }
        }
    });
    return {
        observability,
        exporter: bridge
    };
}
class MastraInstrumentor {
    _provider = null;
    _origMastraConstructor = null;
    _mastraModule = null;
    instrument(options) {
        this._provider = options.tracerProvider;
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const mastraModule = options._module ?? __turbopack_context__.r("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@mastra+core@1.35.0_@standard-community+standard-json@0.3.5_@standard-schema+spec@1.1.0_98b20cd9cb163e2a684885e8a486228d/node_modules/@mastra/core/dist/index.cjs [instrumentation] (ecmascript)");
            this._patchMastraConstructor(mastraModule, options);
        } catch (e) {
        // @mastra/core not installed — no-op
        }
    }
    _patchFailed(reason) {
        this._origMastraConstructor = null;
        this._mastraModule = null;
        _warn(`Cannot patch @mastra/core: ${reason}. ` + 'Mastra spans will not be collected. ' + 'Use `createNeatlogsMastraObservability()` and pass the result to ' + 'new Mastra({ observability: ... }) directly instead.');
    }
    disable() {
        if (this._mastraModule && this._origMastraConstructor) {
            try {
                this._mastraModule.Mastra = this._origMastraConstructor;
            } catch  {
                try {
                    Object.defineProperty(this._mastraModule, 'Mastra', {
                        value: this._origMastraConstructor,
                        writable: true,
                        configurable: true
                    });
                } catch  {
                // best-effort
                }
            }
        }
        this._origMastraConstructor = null;
        this._mastraModule = null;
        this._provider = null;
    }
    _patchMastraConstructor(mastraModule, options) {
        const MastraClass = mastraModule.Mastra;
        if (!MastraClass) return;
        const provider = this._provider;
        const origConstructor = MastraClass;
        this._origMastraConstructor = origConstructor;
        this._mastraModule = mastraModule;
        const PatchedMastra = function(config) {
            const cfg = config ?? {};
            if (!cfg.observability) {
                try {
                    const obsModule = options._observabilityModule ?? (()=>{
                        throw new Error('sync path unavailable');
                    })();
                    const Obs = obsModule?.Observability ?? obsModule?.default?.Observability;
                    if (typeof Obs === 'function') {
                        const bridge = options._exporter ?? new NeatlogsMastraBridge(provider);
                        cfg.observability = new Obs({
                            configs: {
                                default: {
                                    serviceName: 'mastra',
                                    bridge
                                }
                            }
                        });
                    }
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    _warn(`Mastra instrumentation could not activate: ${msg}. ` + 'Use getMastraObservability() from neatlogs for ESM projects.');
                }
            }
            return Reflect.construct(origConstructor, [
                cfg
            ], new.target ?? origConstructor);
        };
        PatchedMastra.prototype = MastraClass.prototype;
        Object.setPrototypeOf(PatchedMastra, MastraClass);
        for (const key of Object.getOwnPropertyNames(MastraClass)){
            if (key === 'prototype' || key === 'length' || key === 'name') continue;
            try {
                const desc = Object.getOwnPropertyDescriptor(MastraClass, key);
                if (desc) Object.defineProperty(PatchedMastra, key, desc);
            } catch  {
            // best-effort
            }
        }
        const desc = Object.getOwnPropertyDescriptor(mastraModule, 'Mastra');
        if (desc && !desc.configurable) {
            this._patchFailed('the "Mastra" export is non-configurable ' + '(module exports are sealed). Constructor patching is not possible');
            return;
        }
        try {
            mastraModule.Mastra = PatchedMastra;
        } catch  {
            try {
                Object.defineProperty(mastraModule, 'Mastra', {
                    value: PatchedMastra,
                    writable: true,
                    configurable: true
                });
            } catch  {
                this._patchFailed('all attempts to replace the "Mastra" ' + 'export on the module object threw errors');
                return;
            }
        }
        if (mastraModule.Mastra !== PatchedMastra) {
            this._patchFailed('the "Mastra" export was not replaced ' + 'after assignment (silent no-op)');
        }
    }
}
const __TURBOPACK__default__export__ = MastraInstrumentor;
 //# sourceMappingURL=instrumentation.js.map
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@neatlogs+instrumentation-mastra@0.1.2_edb8190726b9c0715a2b14c366f33bbd/node_modules/@neatlogs/instrumentation-mastra/dist/esm/index.js [instrumentation] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$neatlogs$2b$instrumentation$2d$mastra$40$0$2e$1$2e$2_edb8190726b9c0715a2b14c366f33bbd$2f$node_modules$2f40$neatlogs$2f$instrumentation$2d$mastra$2f$dist$2f$esm$2f$instrumentation$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@neatlogs+instrumentation-mastra@0.1.2_edb8190726b9c0715a2b14c366f33bbd/node_modules/@neatlogs/instrumentation-mastra/dist/esm/instrumentation.js [instrumentation] (ecmascript)");
;
;
 //# sourceMappingURL=index.js.map
}),
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@neatlogs+instrumentation-mastra@0.1.2_edb8190726b9c0715a2b14c366f33bbd/node_modules/@neatlogs/instrumentation-mastra/dist/esm/index.js [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "MastraInstrumentor",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$neatlogs$2b$instrumentation$2d$mastra$40$0$2e$1$2e$2_edb8190726b9c0715a2b14c366f33bbd$2f$node_modules$2f40$neatlogs$2f$instrumentation$2d$mastra$2f$dist$2f$esm$2f$instrumentation$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["MastraInstrumentor"],
    "NeatlogsMastraExporter",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$neatlogs$2b$instrumentation$2d$mastra$40$0$2e$1$2e$2_edb8190726b9c0715a2b14c366f33bbd$2f$node_modules$2f40$neatlogs$2f$instrumentation$2d$mastra$2f$dist$2f$esm$2f$instrumentation$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["NeatlogsMastraExporter"],
    "createNeatlogsMastraObservability",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$neatlogs$2b$instrumentation$2d$mastra$40$0$2e$1$2e$2_edb8190726b9c0715a2b14c366f33bbd$2f$node_modules$2f40$neatlogs$2f$instrumentation$2d$mastra$2f$dist$2f$esm$2f$instrumentation$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["createNeatlogsMastraObservability"],
    "default",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$neatlogs$2b$instrumentation$2d$mastra$40$0$2e$1$2e$2_edb8190726b9c0715a2b14c366f33bbd$2f$node_modules$2f40$neatlogs$2f$instrumentation$2d$mastra$2f$dist$2f$esm$2f$instrumentation$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["MastraInstrumentor"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$neatlogs$2b$instrumentation$2d$mastra$40$0$2e$1$2e$2_edb8190726b9c0715a2b14c366f33bbd$2f$node_modules$2f40$neatlogs$2f$instrumentation$2d$mastra$2f$dist$2f$esm$2f$index$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@neatlogs+instrumentation-mastra@0.1.2_edb8190726b9c0715a2b14c366f33bbd/node_modules/@neatlogs/instrumentation-mastra/dist/esm/index.js [instrumentation] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$neatlogs$2b$instrumentation$2d$mastra$40$0$2e$1$2e$2_edb8190726b9c0715a2b14c366f33bbd$2f$node_modules$2f40$neatlogs$2f$instrumentation$2d$mastra$2f$dist$2f$esm$2f$instrumentation$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@neatlogs+instrumentation-mastra@0.1.2_edb8190726b9c0715a2b14c366f33bbd/node_modules/@neatlogs/instrumentation-mastra/dist/esm/instrumentation.js [instrumentation] (ecmascript)");
}),
];

//# sourceMappingURL=91af5__pnpm_be6d392b._.js.map