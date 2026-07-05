import Assert from '#core/Assert.js';

const REGEX = /(?<base>[^*< >\n[\]]+)(< (?<generic>.*) >)?(\[(?<count>\d+)?])?(?<pointer>\*)?/;

class FieldDefinition {
    /**
     * @public
     * @constructor
     * @param {String} baseType
     * @param {FieldDefinition|null} generic
     * @param {number|null} count
     * @param {boolean} pointer
     * @param {String|null} rawType
     */
    constructor(baseType, generic, count, pointer, rawType = null) {
        Assert.isTrue(typeof baseType === 'string' && baseType.length > 0);
        Assert.isTrue(generic === null || generic instanceof FieldDefinition);
        Assert.isTrue(count === null || Number.isInteger(count));
        Assert.isTrue(typeof pointer === 'boolean');
        Assert.isTrue(rawType === null || typeof rawType === 'string');

        this._baseType = baseType;
        this._generic = generic;
        this._count = count;
        this._pointer = pointer;
        this._rawType = rawType;
    }

    get baseType() {
        return this._baseType;
    }

    get generic() {
        return this._generic;
    }

    get count() {
        return this._count;
    }

    get pointer() {
        return this._pointer;
    }

    get rawType() {
        return this._rawType;
    }

    /**
     * @public
     * @returns {{rawType: String|null, baseType: String, generic: object|null, count: number|null, pointer: boolean}}
     */
    describe() {
        return {
            rawType: this._rawType,
            baseType: this._baseType,
            generic: this._generic === null ? null : this._generic.describe(),
            count: this._count,
            pointer: this._pointer
        };
    }

    /**
     * @public
     * @static
     * @param {String} varType
     * @returns {FieldDefinition}
     */
    static parse(varType) {
        Assert.isTrue(typeof varType === 'string');

        const groups = REGEX.exec(varType).groups;

        const baseType = groups.base;
        const generic = groups.generic ? FieldDefinition.parse(groups.generic) : null;
        const count = groups.count ? parseInt(groups.count) : null;
        const pointer = groups.pointer === '*';

        return new FieldDefinition(baseType, generic, count, pointer, varType);
    }
}

export default FieldDefinition;
