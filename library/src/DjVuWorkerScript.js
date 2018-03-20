import DjVuDocument from './DjVuDocument';
import IWImageWriter from './iw44/IWImageWriter';
import { DjVuError, DjVuErrorCodes } from './DjVuErrors';

/**
 * Это скрипт для выполнения в фоновом потоке. 
 */
export default function initWorker() {

    /** @type {DjVuDocument} */
    var djvuDocument; // главный объект документа
    /** @type {IWImageWriter} */
    var iwiw; // объект записи документов

    // обрабочик приема событий
    onmessage = function (oEvent) {
        try { // отлавливаем все исключения
            var obj = oEvent.data;
            handlers[obj.command](obj);
        } catch (error) {
            // we can't pass the native Error object between workers, so only several properties are copied
            var errorObj = error instanceof DjVuError ? error : {
                code: DjVuErrorCodes.UNEXPECTED_ERROR,
                name: error.name,
                message: error.message
            };
            errorObj.lastCommandObject = obj;
            postMessage({
                command: 'Error',
                id: obj.id,
                error: errorObj
            });
        }
    };


    var handlers = {

        getPageText(obj) {
            return new Promise((resolve, reject) => {
                var pagenum = +obj.pagenumber;
                var text = djvuDocument.getPage(pagenum).getText();
                postMessage({
                    command: 'getPageText',
                    id: obj.id,
                    text: text
                });
            });
        },

        getPageImageDataWithDpi(obj) {
            var pagenum = +obj.pagenumber;
            var page = djvuDocument.getPage(pagenum);
            var imageData = page.getImageData(obj.onlyFirstBgChunk);
            var dpi = page.getDpi();
            postMessage({
                command: 'getPageImageDataWithDpi',
                id: obj.id,
                buffer: imageData.data.buffer,
                width: imageData.width,
                height: imageData.height,
                dpi: dpi
            }, [imageData.data.buffer]);
        },

        getPageCount(obj) {
            postMessage({
                command: 'getPageCount',
                id: obj.id,
                pageNumber: djvuDocument.pages.length
            });
        },

        getDocumentMetaData(obj) {
            var str = djvuDocument.toString(obj.html);
            postMessage({ command: 'getDocumentMetaData', id: obj.id, str: str });
        },

        startMultiPageDocument(obj) {
            iwiw = new IWImageWriter(obj.slicenumber, obj.delayInit, obj.grayscale);
            iwiw.startMultiPageDocument();
            postMessage({ command: 'startMultiPageDocument', id: obj.id });
        },

        addPageToDocument(obj) {
            var imageData = new ImageData(new Uint8ClampedArray(obj.simpleImage.buffer), obj.simpleImage.width, obj.simpleImage.height);
            iwiw.addPageToDocument(imageData);
            postMessage({ command: 'addPageToDocument', id: obj.id });
        },

        endMultiPageDocument(obj) {
            var buffer = iwiw.endMultiPageDocument();
            postMessage({ command: 'endMultiPageDocument', id: obj.id, buffer: buffer }, [buffer]);
        },

        createDocumentFromPictures(obj) {
            var sims = obj.images;
            var imageArray = new Array(sims.length);
            // собираем объекты ImageData
            for (var i = 0; i < sims.length; i++) {
                imageArray[i] = new ImageData(new Uint8ClampedArray(sims[i].buffer), sims[i].width, sims[i].height);
            }
            var iw = new IWImageWriter(obj.slicenumber, obj.delayInit, obj.grayscale);
            iw.onprocess = (percent) => {
                postMessage({ command: 'Process', percent: percent });
            };
            var ndoc = iw.createMultyPageDocument(imageArray);
            postMessage({ command: 'createDocumentFromPictures', id: obj.id, buffer: ndoc.buffer }, [ndoc.buffer]);
        },

        slice(obj) {
            var ndoc = djvuDocument.slice(obj.from, obj.to);
            postMessage({ command: 'slice', id: obj.id, buffer: ndoc.buffer }, [ndoc.buffer]);
        },

        createDocument(obj) {
            djvuDocument = new DjVuDocument(obj.buffer);
            postMessage({ command: 'createDocument', id: obj.id, pagenumber: djvuDocument.pages.length });
        },

        reloadDocument() {
            djvuDocument = new DjVuDocument(djvuDocument.buffer);
        }
    };
}