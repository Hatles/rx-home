import {transform} from "./file-converter";

interface SearchResult {
    start: number,
    end: number,
    result: string,
    content: string,
    regexResult?: RegExpExecArray,
    transformer: FileTransformer
}

export type StringReplacer = (content: string, origin: SearchResult) => string;
export type StringSearchResultReplacer = (content: string, result: SearchResult, str: string) => string;

interface FileTransformer {
    title: string,
    search?: RegExp | string | ((content: string) => SearchResult | null),
    replace?: string | StringReplacer,
    children?: FileTransformer[]
    childrenOptions?: TransformerOptions
}

function replaceWithResult(content: string, result: SearchResult, str: string) {
    return content.substring(0, result.start) + str + content.substring(result.end);
}

const regex: FileTransformer[] = [
    {
        title: 'global comment',
        search: /^"""(((?!""").|\n)*)"""/gm,
        replace: '/**\n * $1\n */',
    },
    {
        title: 'class',
        search: /^class ([a-zA-Z_]+)(\((((?!\)).|\n)*)\)|):\n([ ]*"""(((?!""").|\n)*)""")?\n((([ ]*\n)* {4}.*\n)*)/gm,
        replace: '/**\n * $6\n */\nexport class $1 extends $3 {\n$8}',
    },
    {
        title: 'fix extends',
        search: ' extends  {',
        replace: ' {',
    },
    {
        title: 'fix enum',
        search: /class (.*) extends enum.Enum/gm,
        replace: 'enum $1',
    },
    {
        title: 'const',
        search: /^([a-zA-Z_0-9]+(: .*)?)[ ]*=/gm,
        replace: 'export const $1 =',
    },
    {
        title: 'export fn',
        search: /^((async |)def) ([a-zA-Z_]+)\((((?!\)).|\n)*)\) -> ([a-zA-Z_\[\], ".]*)[ ]*:\n([ ]*"""(((?!""").|\n)*)""")?\n((([ ]*\n)* {4}.*\n)*)/gm,
        replace: '/**\n * $8\n */\nexport $2function $3($4): $6 {\n$10}',
    },
    // {
    //     title: 'export fn',
    //     search: /^(@[.a-z]*\n|)((async |)def) ([a-zA-Z_]+)\((((?!\)).|\n)*)\) \-\> ([a-zA-Z_\[\].]*)[ ]*\:\n([ ]*"""(((?!""").|\n)*)""")?/gm,
    //     replace: `//$1\n/**\n * $9\n */\nexport $3function $4($5): $7 {\n<_fn_>`,
    // },
    {
        title: 'local fn',
        search: /^([ ]+)((async |)def) ([a-zA-Z_]+)\((((?!\)).|\n)*)\) -> ([a-zA-Z_\[\], ".]*)[ ]*:\n([ ]*"""(((?!""").|\n)*)""")?\n((([ ]*\n)*\1 {4}.*\n)*)/gm,
        replace: '$1/**\n$1 * $9\n$1 */\n$1$3$4($5): $7 {\n$11$1}\n',
    },
    {
        title: 'local fn without return type',
        search: /^([ ]+)((async |)def) ([a-zA-Z_]+)\((((?!\)).|\n)*)\):\n([ ]*"""(((?!""").|\n)*)""")?\n((([ ]*\n)*\1 {4}.*\n)*)/gm,
        replace: '$1/**\n$1 * $8\n$1 */\n$1$3$4($5) {\n$10$1}\n',
    },
    // {
    //     title: 'local const',
    //     search: /^([ ]+)([a-zA-Z_]* ?(: ?.*)? ?= ?.*)(?<!,)$/gm,
    //     replace: '$1const $2',
    // },
    {
        title: 'comment',
        search: '#',
        replace: '//',
    },
    {
        title: 'raise to throw',
        search: /raise (.*)/gm,
        replace: 'throw new $1',
    },
    {
        title: 'for in -> of',
        search: /^([ ]*)for (.*) in (.*):\n((([ ]*\n)*\1 {4}.*\n)*)/gm,
        replace: '$1for(const $2 of $3) {\n$4$1}\n',
    },
    {
        title: 'if',
        search: /^([ ]*)if \(?(([^{:]*)|((.*\n)*))([^\)])\)?:.*\n((([ ]*\n)*\1 {4}.*\n)*)/gm,
        replace: '$1if iw*($2$6) {\n$7$1}\n',
    },
    {
        title: 'while',
        search: /^([ ]*)while \(?(([^{:]*)|((.*\n)*))([^\)])\)?:.*\n((([ ]*\n)*\1 {4}.*\n)*)/gm,
        replace: '$1while iw*($2$6) {\n$7$1}\n',
    },
    {
        title: 'else if',
        search: /^([ ]*)elif \(?(([^{:]*)|((.*\n)*))([^\)])\)?:.*\n((([ ]*\n)*\1 {4}.*\n)*)/gm,
        replace: '$1else if *($2$6) {\n$7$1}\n',
    },
    {
        title: 'ifwhile condition',
        search: /iw\*\((([^{:]*)|((.*\n)*))([^\)])\)/gm,
        replace: (content, origin) => {
            return '(' + content.substring(4, content.length - 1).replace(/not /gm, '!') + ')';
        }
    },
    {
        title: 'else try finally',
        search: /^([ ]*)(else|try|finally):\n((([ ]*\n)*\1 {4}.*\n)*)/gm,
        replace: '$1$2 {\n$3$1}\n',
    },
    {
        title: 'except',
        search: /^([ ]*)except ([^:]*)( as ([^:]*)|):(.*)\n((([ ]*\n)*\1    .*\n)*)/gm,
        replace: '$1catch (e) {$5\n$1    if (e instanceof $2) {\n$6$1    }\n$1    else {\n$1        throw e;\n$1    }\n$1}\n\n',
    },
    {
        title: 'attribute',
        search: /^([ ]*)@/gm,
        replace: '$1// @',
    },
    {
        title: 'List to array',
        search: /List\[(.*)\]/gm,
        replace: '$1[]',
    },
    {
        title: 'Generic type',
        search: /:[ ]*([a-zA-Z]+)\[([a-zA-Z,. ]+)\]/gm,
        replace: ': $1<$2>',
    },
    {
        title: 'None fn',
        search: ': None',
        replace: '',
    },
    {
        title: 'None',
        search: 'None',
        replace: 'null',
    },
    {
        title: 'False',
        search: 'False',
        replace: 'false',
    },
    {
        title: 'True',
        search: 'True',
        replace: 'true',
    },
    {
        title: 'datetime',
        search: /datetime\.datetime/,
        replace: 'Date',
    },
    {
        title: 'str type',
        search: /([^0-9a-zA-Z_])str([^0-9a-zA-Z_])/,
        replace: '$1string$2',
    },
    {
        title: 'str type in list',
        search: '<str>',
        replace: '<string>',
    },
    {
        title: 'int type',
        search: /([^0-9a-zA-Z_])xxx([^0-9a-zA-Z_])/,
        replace: '$1number$2',
    },
    {
        title: 'float type',
        search: /([^0-9a-zA-Z_])xxx([^0-9a-zA-Z_])/,
        replace: '$1number$2',
    },
    {
        title: 'any type',
        search: /([^0-9a-zA-Z_])xxx([^0-9a-zA-Z_])/,
        replace: '$1any$2',
    },
    {
        title: 'bool type',
        search: /([^0-9a-zA-Z_])xxx([^0-9a-zA-Z_])/,
        replace: '$1boolean$2',
    },
    {
        title: 'constructor',
        search: '__init__',
        replace: 'constructor',
    },
    {
        title: 'self to this',
        search: /self\./gm,
        replace: 'this.',
    },
    {
        title: 'self to this',
        search: 'self,[ ]?',
        replace: '',
    },
    {
        title: 'self to this',
        search: /\(self\)/gm,
        replace: '()',
    },
    {
        title: 'length',
        search: /([^0-9a-zA-Z_])len\(([^)]*)\)/gm,
        replace: '$1$2.length',
    },
    {
        title: 'isinstance',
        search: /([^0-9a-zA-Z_])isinstance\(([^),]*), ?([^)]*)\)/gm,
        replace: '$1$2 instanceof $3',
    },
    {
        title: 'string builder',
        search: /([^0-9a-zA-Z_])f\"(.*)\"/gm,
        replace: (content, origin) => {
            return '`' + content.substring(3, content.length - 1).replace(/\{([^}{]*)\}/gm, '$${$1}') + '`';
        }
    },
    {
        title: 'is null',
        search: /([^ \(]+) is null/gm,
        replace: '!$1'
    },
    {
        title: 'is not null',
        search: /([^ \(]+) is not null/gm,
        replace: '$1'
    },
    {
        title: 'not in',
        search: /([^ \(]+) not in ([^ \)]+)/gm,
        replace: '$1'
    },
    {
        title: 'equal',
        search: /([^=!])==([^=!])/gm,
        replace: '$1===$2'
    },
    {
        title: 'not equal',
        search: /([^=!])!=([^=!])/gm,
        replace: '$1!==$2'
    },
    {
        title: 'fix if/while close condition',
        search: /(if|while) \((.*[^ )]) ?\{/gm,
        replace: '$1 ($2) {',
    },
    {
        title: 'lambda',
        search: /: lambda ([^:]*): (.*)/gm,
        replace: ': ($1) => $2',
    },
]

function isSameResult(searchResult: SearchResult, prevResult: SearchResult) {
    return prevResult
        && searchResult.result === prevResult.result
        && searchResult.start === prevResult.start
        && searchResult.end === prevResult.end
        ;
}

export interface TransformerOptions {
    maxTries?: number
}

const contentTransformer = (content: string, transformers: FileTransformer[], options?: TransformerOptions) => {
    // options
    const {maxTries = 10, maxTriesAbs = 1000}: any = options || {};

    transformers.forEach(rg => {

        // children transformers
        const transformWithChildren = (result: SearchResult): string => {
            if (rg.children && rg.children.length) {
                return contentTransformer(result.result, rg.children, {...options, ...(rg.childrenOptions || {})});
            }
            else {
                return result.result;
            }
        }

        if (rg.search) {
            // loop detection vars
            let it = 0;
            let itAbs = 0;
            let prevResult: SearchResult = null;
            let detectedLoop: boolean = false;
            const updateLoop = (newResult: SearchResult) => {
                itAbs++;
                if (isSameResult(newResult, prevResult)) {
                    it++;
                }
                if (it > maxTries) {
                    detectedLoop = true;
                    debugger
                    console.warn('Detected loop for transformer ' + rg.title);
                }
                if (itAbs > maxTriesAbs) {
                    detectedLoop = true;
                    debugger
                    console.error('Detected abs loop for transformer ' + rg.title);
                }

                prevResult = newResult;
            };

            // search by regex
            if (rg.search instanceof RegExp || typeof rg.search === 'string') {
                const search = new RegExp(rg.search, 'm')
                let result: RegExpExecArray;

                let replace: StringSearchResultReplacer;
                if (!rg.replace && typeof rg.replace !== "string" ) {
                    replace = (content, result, str) => replaceWithResult(content, result, str);
                }
                else if (typeof rg.replace === 'string') {
                    replace = (content, result, str) => content.replace(search, rg.replace as string);
                }
                else if (typeof rg.replace === 'function') {
                    replace = (content, result, str) => replaceWithResult(content, result, (rg.replace as StringReplacer)(str, result));
                }
                else {
                    throw new TypeError('replace must be null or a string or a function, got ' + (typeof rg.replace));
                }

                while ((result = search.exec(content)) !== null && !detectedLoop) {
                    const searchResult = {
                        start: result.index,
                        end: result.index + result[0].length,
                        result: result[0],
                        content: content,
                        regexResult: result,
                        transformer: rg
                    };

                    // prevent loop
                    updateLoop(searchResult);

                    // children
                    const transformedResult: string = transformWithChildren(searchResult);

                    content = replace(content, searchResult, transformedResult);
                }
            }
            // search by custom function
            else {
                debugger
                let searchResult: SearchResult;

                let replace: StringSearchResultReplacer;
                if (!rg.replace && rg.replace !== '') {
                    replace = (content, result, str) => replaceWithResult(content, result, str);
                }
                else if (typeof rg.replace === 'string') {
                    replace = (content, searchResult) => replaceWithResult(content, searchResult, rg.replace as string)
                }
                else if (typeof rg.replace === 'function') {
                    replace = (content, result, str) => replaceWithResult(content, result, (rg.replace as StringReplacer)(str, result));
                }
                else {
                    throw new TypeError('replace must be null or a string or a function, got ' + (typeof rg.replace));
                }

                while ((searchResult = rg.search(content)) !== null && !detectedLoop) {

                    // prevent loop
                    updateLoop(searchResult);

                    // children
                    const transformedResult = transformWithChildren(searchResult);

                    content = replace(content, searchResult, transformedResult);
                }
            }
        }
        else if (typeof rg.replace === 'function') {
            debugger
            const result = content;

            let replace: StringSearchResultReplacer;
            if (!rg.replace) {
                replace = (content, result, str) => replaceWithResult(content, result, str);
            }
            else if (typeof rg.replace === 'string') {
                replace = (content, searchResult) => replaceWithResult(content, searchResult, rg.replace as string)
            }
            else if (typeof rg.replace === 'function') {
                replace = (content, result, str) => replaceWithResult(content, result, (rg.replace as StringReplacer)(str, result));
            }
            else {
                throw new TypeError('replace must be null or a string or a function, got ' + (typeof rg.replace));
            }

            const searchResult = {start: 0, end: result.length, content: content, result: result, transformer: rg};

            // children
            const transformedResult = transformWithChildren(searchResult);

            content = replace(content, searchResult, transformedResult);
        }
        else {
            debugger
            return rg.replace;
        }
    })

    return content;
};

const pyToTsTransformer = (content: string) => {
    return contentTransformer(content, regex);
}

const pyToTsFilter = (filename: string, ext: string = 'ts') => {
    const fileWithExt = filename.split('.');
    return fileWithExt.length > 1 && fileWithExt[fileWithExt.length - 1] === ext
};

const pyToTsFilenameTransformer = (filename: string, ext: string = 'ts') => {
    const fileWithExt = filename.split('.');
    return fileWithExt[0] + '.' + ext
};

(async () => {
    const result = await transform(
        './sources/homeassistant-core/',
        './sources/dist/', pyToTsTransformer,
        (filename) => pyToTsFilter(filename, 'py'),
        (filename) => pyToTsFilenameTransformer(filename, 'ts')
    );

    console.log(result);
})()
