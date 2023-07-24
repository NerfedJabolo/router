import { StaticRoute } from './types';

type PathHandler = {
    method: string,
    index: number,
    ws: number
};
type HandlerObject = {
    [path: string]: PathHandler[]
};

// n: The 404 response option
// f: The function to search for the route
// h: The custom 404 handler
// r: The request
// t: The pre-handler
// b: The pre-handler result
// i: The inject object
// q: list of data match on index of WS handlers
// s: Start index of path
// c: Prefix for other handlers of static routes
// w: Prefix for websocket data
const handleRoute = (returnStatement: string, args: string) => `const o=f(r);if(o===null)${returnStatement}r.params=o;return o._(${args});`;

function isAsync(func: Function) {
    return func && func.constructor.name === 'AsyncFunction';
}

function getWSHandler(wsIndex: number | string) {
    if (typeof wsIndex === 'number')
        wsIndex = 'w' + wsIndex;
    else 
        wsIndex = `q[${wsIndex}]`;
    return `{r._=${wsIndex};return this.upgrade(r,{data:r});}`;
}

function getSwitchHandler(item: PathHandler, args: string) {
    return item.ws === -1 ? `return c${item.index}(${args});` : getWSHandler(item.ws);
}

function checkMethods(list: PathHandler[], args: string) {
    if (list.length === 1) {
        const item = list[0], { method } = item;
        return `if(r.method==='${method}')${getSwitchHandler(item, args)}break;`;
    }
    return `switch(r.method){${list.map(item => `case'${item.method}':${getSwitchHandler(item, args)}`)}}`;
}

function getHandler(path: string, method: string) {
    return `app.static['${path}']['${method}']`;
}

function searchHandler(routes: StaticRoute) {
    const hs: HandlerObject = {};
    let index = 0;
    for (const path in routes) {
        const pathHandlers = routes[path];

        for (const method in pathHandlers) {
            if (!hs[path])
                hs[path] = [];

            let ws = -1;
            const currentHandler = pathHandlers[method];
            if (typeof currentHandler === 'number')
                ws = currentHandler as number;

            hs[path].push({ 
                method, index, ws,
            });
            ++index;
        }
    }

    return hs;
}

const default404 = ' new Response(null,n)';
function createFetchBody(app: any) {
    const routes = app.static as StaticRoute;
    const routerExists = !!app.router;

    const injectExists = !!app.injects,
        callArgs = 'r' + (injectExists ? ',i' : '');

    // If the app does registers a 404 handler change the return statement
    // app.fn404 is false when a handler is not set but use(404) is called
    let returnStatement = 'return';
    if (app.fn404 === false)
        returnStatement += default404;
    else if (app.fn404)
        returnStatement += ' h(r)';
    returnStatement += ';';

    // Search handlers
    const handlers = searchHandler(routes);
    let fnSetLiteral = '', fnWSLiteral = '';
    for (const path in handlers)
        for (const item of handlers[path]) {
            fnSetLiteral += `c${item.index}=${getHandler(path, item.method)},`;
            if (item.ws !== -1) 
                fnWSLiteral += `w${item.index}=app.webSocketHandlers[${item.index}],`
        }

    // Paths
    const paths = Object.keys(routes);

    // Switch literal
    let fnSwitchLiteral = '';
    for (const path of paths)
        fnSwitchLiteral += `case'${path.substring(1)}':${checkMethods(handlers[path], callArgs)}`;

    const preHandlerPrefix = isAsync(app.fnPre) ? 'await ' : '',
        switchStatement = (fnSwitchLiteral === '' ? '' : `switch(r.path){${fnSwitchLiteral}}`)
        + (routerExists ? handleRoute(returnStatement, callArgs) : returnStatement);

    const exactHostExists = !!app.base,
        exactHostVal = app.base?.length + 1 || 's';

    // All variables are in here
    let declarationLiteral = `${fnSetLiteral}${app.fn404 ? `h=app.fn404,` : ''}${app.fn404 === false ? 'n={status:404},' : ''}${app.router ? `f=app.router.find.bind(app.router),` : ''}${app.fnPre ? 't=app.fnPre,' : ''}${injectExists ? 'i=app.injects,' : ''}${fnWSLiteral}`;
    if (declarationLiteral !== '')  
        declarationLiteral = 'const ' + declarationLiteral.slice(0, -1) + ';';

    const fnBody = `${declarationLiteral}return ${isAsync(app.fnPre) ? 'async ' : ''}function(r){${exactHostExists ? '' : "const s=r.url.indexOf('/',12)+1;"}r.query=r.url.indexOf('?',${exactHostVal});r.path=r.query===-1?r.url.substring(${exactHostVal}):r.url.substring(${exactHostVal},r.query);${app.fnPre 
    ? (app.fnPre.response
        ? `const b=${preHandlerPrefix}t(r);if(b!==undefined)return b;`
        : `if(${preHandlerPrefix}t(r)!==undefined)${returnStatement}`
    ) : ''
    }${switchStatement}}`;

    // Create function body
    return fnBody;
};

// Deez nuts
const exec = globalThis.process && await import('vm').then(i => i.runInNewContext);
/**
 * Create fetch function for Deno and Cloudflare workers
 * @param app 
 */
export function createFetch(app: any) {
    const body = createFetchBody(app);

    if (app.useVM && exec)
        return exec(`(app${app.fn404 === false ? ',Response' : ''}) => {${body}}`)(app, Response);
    return Function('app', body)(app);
}

export function createWSHandler(name: string) {
    const argsList = 'w' + (name === 'close' ? ',c,m' : '');
    // Optimization: message handler should exist
    const body = name === 'message' 
        ? 'return function(w,m){w.data._.message(w,m)}' 
        : `const n='${name}';return function(${argsList}){if(n in w.data._)w.data._.${name}(${argsList})}`;
    return Function(body)();
}
