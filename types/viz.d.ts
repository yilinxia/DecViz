declare module 'viz.js/full.render.js' {
    export default class Viz {
        constructor();
        renderString(dot: string): Promise<string>;
    }
}
