import basicMatch from './basicMatch';
import optimizedMatch from './optimizedMatch';
import { Node, FindResult, ParamNode } from './types';
const methods = ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'CONNECT', 'OPTIONS', 'TRACE', 'PATCH'];

const createNode = <T>(part: string, inert?: Node<T>[]): Node<T> => ({
    part,
    store: null,
    inert:
        inert !== undefined
            ? new Map(inert.map((child) => [child.part.charCodeAt(0), child]))
            : null,
    params: null,
    wildcardStore: null
});

const cloneNode = <T>(node: Node<T>, part: string) => ({
    ...node,
    part
});

const createParamNode = <T>(paramName: string): ParamNode<T> => ({
    paramName,
    store: null,
    inert: null
});

export class Radx<T> {
    root: Record<string, Node<T>> = {};
    rootList: Node<T>[] = new Array(methods.length);
    normalUsage: boolean = true;

    private static regex = {
        static: /:.+?(?=\/|$)/,
        params: /:.+?(?=\/|$)/g
    };

    constructor() {
        for (const method of methods)
            this.root[method] = null;
    }

    add(method: string, path: string, store: T): FindResult<T>[0] {
        if (typeof path !== 'string')
            throw new TypeError('Route path must be a string');
        const inNormalMode = this.normalUsage;

        if (path === '') path = '/';
        else if (path[0] !== '/') path = `/${path}`;

        const isWildcard = path[path.length - 1] === '*';
        if (isWildcard) {
            // Slice off trailing '*'
            path = path.slice(0, -1);
        }

        const inertParts = path.split(Radx.regex.static);
        const paramParts = path.match(Radx.regex.params) || [];

        if (inertParts[inertParts.length - 1] === '') inertParts.pop();

        let node: Node<T>;

        if (this.root[method] === null) 
            node = this.root[method] = createNode<T>(inNormalMode ? '/' : ''); 
        else node = this.root[method];

        let paramPartsIndex = 0;
        for (let i = 0; i < inertParts.length; ++i) {
            let part = inertParts[i];
            if (!inNormalMode) part = part.substring(1);

            if (i > 0) {
                // Set param on the node
                const param = paramParts[paramPartsIndex++].substring(1);

                if (node.params === null) node.params = createParamNode(param);
                else if (node.params.paramName !== param)
                    throw new Error(
                        `Cannot create route "${path}" with parameter "${param}" ` +
                        'because a route already exists with a different parameter name ' +
                        `("${node.params.paramName}") in the same location`
                    );

                const params = node.params;
                if (params.inert === null) {
                    node = params.inert = createNode(part);
                    continue;
                };

                node = params.inert;
            }

            for (let j = 0; ;) {
                if (j === part.length) {
                    if (j < node.part.length) {
                        // Move the current node down
                        const childNode = cloneNode(node, node.part.slice(j))
                        Object.assign(node, createNode(part, [childNode]))
                    }
                    break
                }

                if (j === node.part.length) {
                    // Add static child
                    if (node.inert === null) node.inert = new Map();
                    else if (node.inert.has(part.charCodeAt(j))) {
                        // Re-run loop with existing static node
                        node = node.inert.get(part.charCodeAt(j));
                        part = part.slice(j);
                        j = 0;
                        continue;
                    }

                    // Create new node
                    const childNode = createNode<T>(part.slice(j));
                    node.inert.set(part.charCodeAt(j), childNode);
                    node = childNode;
                    break;
                }
                if (part[j] !== node.part[j]) {
                    // Split the node
                    const existingChild = cloneNode(node, node.part.slice(j));
                    const newChild = createNode<T>(part.slice(j));

                    Object.assign(
                        node,
                        createNode(node.part.slice(0, j), [
                            existingChild,
                            newChild
                        ])
                    )
                    node = newChild;
                    break;
                }
                ++j;
            }
        }

        if (paramPartsIndex < paramParts.length) {
            // The final part is a parameter
            const param = paramParts[paramPartsIndex];
            const paramName = param.substring(1);

            if (node.params === null) node.params = createParamNode(paramName);
            else if (node.params.paramName !== paramName)
                throw new Error(
                    `Cannot create route "${path}" with parameter "${paramName}" ` +
                    'because a route already exists with a different parameter name ' +
                    `("${node.params.paramName}") in the same location`
                );

            if (node.params.store === null) node.params.store = store;
            return node.params.store;
        }

        if (isWildcard) {
            // The final part is a wildcard
            if (node.wildcardStore === null) node.wildcardStore = store;
            return node.wildcardStore
        }

        // The final part is static
        if (node.store === null) node.store = store;
        return node.store;
    }

    /**
     * Create a faster find
     */
    composeFind() {
        const keyExists = [];
        let index: number;
        for (const key in this.root) {
            index = methods.indexOf(key);
            if (this.root[key] !== null)
                keyExists.push({ key, index });
            this.rootList[index] = this.root[key];
        }

        const rootCount = keyExists.length;
        if (rootCount === 0) {
            this.find = function() {return null;};
            return;
        }

        const body = `const ${
            keyExists.map(({ index }) => `c${index} = router.rootList[${index}]`).join(',')
        };return function(r){${
            rootCount > 1 ? `switch(r.method){${
                keyExists.map(({ key, index }) => `case'${key}':return d(c${index},r.url,0,r.url.length);`).join('')
            }default:return null;}` : `return r.method==='${keyExists[0].key}'?d(c${keyExists[0].index},r.path,0,r.path.length):null;`
        }}`;

        this.find = Function('router', 'd', body)(this, this.normalUsage ? basicMatch : optimizedMatch);
    }

    find(r: Request): FindResult<T> | null {
        const root = this.root[r.method];
        if (root === null) return null;
        return basicMatch(root, r.path, 0, r.path.length);
    }
}

export default Radx;

