// src/declarations.d.ts
declare module 'gray-matter' {
    interface GrayMatterResult {
        data: { [key: string]: any };
        content: string;
        orig: string | Buffer;
    }
    
    function matter(input: string | Buffer, options?: any): GrayMatterResult;
    
    namespace matter {
        export function read(filepath: string, options?: any): GrayMatterResult;
        export function stringify(content: string, data: object, options?: any): string;
    }
    
    export = matter;
}