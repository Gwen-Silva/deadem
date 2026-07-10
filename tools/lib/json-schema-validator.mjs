import Ajv2020 from 'ajv/dist/2020.js';

const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    validateFormats: false
});
const validatorCache = new WeakMap();

function compiledValidator(schema) {
    if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
        throw new TypeError('JSON Schema must be an object');
    }
    let validate = validatorCache.get(schema);
    if (!validate) {
        validate = ajv.compile(schema);
        validatorCache.set(schema, validate);
    }
    return validate;
}

export function formatJsonSchemaErrors(errors = []) {
    return errors.map(error => {
        const location = error.instancePath || '/';
        const detail = error.message ?? error.keyword;
        return `${location} ${detail}`;
    });
}

export function validateJsonSchema(schema, value) {
    const validate = compiledValidator(schema);
    const valid = validate(value);
    return {
        valid,
        errors: valid ? [] : formatJsonSchemaErrors(validate.errors ?? []),
        draft: '2020-12',
        runtime: 'ajv/dist/2020.js'
    };
}
