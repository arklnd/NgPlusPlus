// Declaration for Handlebars template files imported as strings.
// At build time, esbuild's hbs-loader plugin converts .hbs files into
// JS modules that export the template content as a default string export.
declare module '*.hbs' {
    const content: string;
    export default content;
}
