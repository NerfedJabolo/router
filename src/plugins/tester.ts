import Router, { buildFetch } from "../core/main";

class ResponseStatus {
    constructor(public code: number, public text: string) { }
}

const nf = { status: 404 },
    toTxT = (r: Response) => r.text(),
    toJSON = (r: Response) => r.json(),
    toBlob = (r: Response) => r.blob(),
    toForm = (r: Response) => r.formData(),
    toBuffer = (r: Response) => r.arrayBuffer(),
    getStatus = (r: Response) => new ResponseStatus(r.status, r.statusText),
    getStatusCode = (r: Response) => r.status,
    getStatusText = (r: Response) => r.statusText;

type Params = [url: string, init?: RequestInit];

/**
 * Create a tester for the current router
 */
export function mock(app: Router) {
    const meta = app.fetchMeta, fn = buildFetch(meta);

    return {
        /**
         * Mock the current fetch handler.
         *
         * If a non-response object is returned, an empty 404 response is returned instead
         */
        async fetch(...args: Params): Promise<Response> {
            let res = fn(new Request(...args));
            if (res instanceof Promise) res = await res;
            if (res instanceof Response) return res;
            return new Response(null, nf);
        },

        /**
         * Mock a request and return the status message
         */
        msg(...args: Params): Promise<string> {
            return this.fetch(...args).then(getStatusText);
        },

        /**
         * Mock a request and get the status code and message
         */
        stat(...args: Params): Promise<ResponseStatus> {
            return this.fetch(...args).then(getStatus);
        },

        /**
         * Mock a request and get the status code
         */
        code(...args: Params): Promise<number> {
            return this.fetch(...args).then(getStatusCode);
        },

        /**
         * Mock a request and convert the response to string
         */
        text(...args: Params): Promise<string> {
            return this.fetch(...args).then(toTxT);
        },

        /**
         * Mock a request and convert the response to JSON
         */
        json<T = any>(...args: Params): Promise<T> {
            return this.fetch(...args).then(toJSON);
        },

        /**
         * Mock a request and convert the response to Blob
         */
        blob(...args: Params): Promise<Blob> {
            return this.fetch(...args).then(toBlob);
        },

        /**
         * Mock a request and convert the response to form data
         */
        form(...args: Params): Promise<FormData> {
            return this.fetch(...args).then(toForm);
        },

        /**
         * Mock a request and convert the response to an ArrayBuffer
         */
        buf(...args: Params): Promise<ArrayBuffer> {
            return this.fetch(...args).then(toBuffer);
        },

        /**
         * Includes the fetch function metadatas
         */
        meta
    }
}
