import { StructuralReplayInspector } from '@deademx/engine';

import Bootstrap from '#bootstrap/Bootstrap.js';

import ProtoProvider from '#providers/ProtoProvider.instance.js';

import { SchemaRegistry } from '@deademx/engine';

function createRegistry() {
    const registry = new SchemaRegistry(ProtoProvider);

    Bootstrap.run(registry);

    return registry;
}

/**
 * Inspect Deadlock replay structure without constructing gameplay state.
 *
 * @param {string|Buffer|Uint8Array} source
 * @param {Object} options
 * @returns {Promise<Object>}
 */
function inspectReplayStructure(source, options = {}) {
    return StructuralReplayInspector.inspectReplayStructure(source, {
        ...options,
        registry: options.registry ?? createRegistry()
    });
}

export { inspectReplayStructure };
