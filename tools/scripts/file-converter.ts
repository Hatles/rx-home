import {mkdir, promises as fs} from "fs";
import * as rdr from "recursive-readdir"

export async function transform(inputDir: string, outputDir: string, contentTransformer: (file: string) => string, filter?: (fileName: string) => boolean, nameTransformer?: (fileName: string) => string)
{
    const inputDirFix = inputDir.replace(/^.(\/|\\)/, '');
    const inputDirFixRegex = inputDirFix.replace(/\//g, '(\\/|\\\\)');

    const convert = (fileName: string, mustConvert: boolean) => {
        return fs.readFile(fileName)
            .then(function(file) {
                return file.toString();
            })
            .then((content) => mustConvert ? contentTransformer(content) : content)
            .catch(function(error) {
                console.error('Convert error:', error);
            });
    };

    const inputToOut = (fileName: string, mustConvert: boolean = true) => {
        const path = (outputDir + '/' + fileName.replace(new RegExp('^' + inputDirFixRegex + '\/?'), '')).split(/\/|\\/).filter(p => p.length);

        if (mustConvert && nameTransformer) {
            path[path.length - 1] = nameTransformer(path[path.length - 1]);
        }

        return path.join('/')
    };

    const inputFileNameToOut = (fileName: string) => {
        if (nameTransformer) {
            return nameTransformer(fileName);
        }

        return fileName;
    };

    const mkdirForFile = (file: string) => {
        const fileName = inputToOut(file);
        const dirs = fileName.split(/\/|\\/).filter(p => p.length).slice(0, -1).join('/');

        mkdir(dirs, function(err) {
            // if (err) throw err;
        });

        return file;
    };

    const writeFile = async (inputFile: string) => {
        const path = inputFile.split(/\/|\\/);
        const file = path[path.length - 1];
        const mustConvert: boolean = filter ? filter(file) : true;

        convert(inputFile, mustConvert)
            .then((content) => {
                return [inputToOut(inputFile, mustConvert), content];
            })
            .then(([output, content]) => fs.writeFile(output as string, content))
            .catch(function(error) {
                console.error('Write file error:', error);
            });

        return inputToOut(inputFile);
    };

    return rdr(inputDir)
        .then((fileName) => {
            console.time('Transformed files in');
            return fileName;
        })
        .then(files => files.map(mkdirForFile))
        .then(files => Promise.all(files.map(writeFile)))
        .then((fileName) => {
            console.timeEnd('Transformed files in');
            return fileName;
        })
        .catch(console.error)
    ;
}
