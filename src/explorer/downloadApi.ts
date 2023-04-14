/* eslint-disable prefer-const */
import * as vscode from 'vscode';
import * as cheerio from 'cheerio';
import { readerDriver } from '../reader';
import { TreeNode } from './TreeNode';
import { writeFile } from 'fs';


export default class DownLoadApi {
    
    private static _opc: vscode.OutputChannel | undefined;
    private static _loading: string | undefined;


    static async downloadBook(node: TreeNode, _fileType?: string) {
        if (this._loading) {
            return vscode.window.showErrorMessage(`正在下载《${this._loading}》`);
        }

        if (!_fileType) {
            _fileType = ".txt";
        }

        this._opc && this._opc.show();

        const _beginTS = new Date().getTime();

        this._loading = node.name;

        let _bookData: string[] = [`《${this._loading}》`];

        let _opcMsg: string[] = ['正在加载章节。。。', `开始下载 《${this._loading}》`];
        this.showOutMsg([..._opcMsg].reverse().join("\n"));

        const chapters: TreeNode[] = await readerDriver.getChapter(node);
        let _index = 0;
        const _maxCp = chapters.length;
        _opcMsg.unshift(`章节加载完毕，开始下载。`);
        _opcMsg.unshift(`${_index + 1} / ${_maxCp}`);
        this.showOutMsg([..._opcMsg].reverse().join("\n"));

        while (_index < _maxCp) {
            let _node = chapters[_index];
            // let _title = _node.name;
            _bookData.push(_node.name);
            let _art = await this.getContext(_node);
            _bookData.push(_art);
            _index++;

            _opcMsg[0] = `${_index + 1} / ${_maxCp}`;
            this.showOutMsg([..._opcMsg].reverse().join("\n"));
        }

        const _endTS = new Date().getTime();
        const _sec = Math.floor((_endTS - _beginTS) / 1000);
        _opcMsg.unshift(`下载完毕，用时${_sec}秒，请保存！`);
        this.showOutMsg([..._opcMsg].reverse().join("\n"));

        const bookData = _bookData.join("\n");
        // const _opt: vscode.SaveDialogOptions
        const uri = await vscode.window.showSaveDialog({
            filters: {
                txt: ["txt"]
            },
            title: this._loading
        });

        // console.log(uri);

        if (!uri) {
            this._loading = undefined;
            // this._opc && this._opc.hide();
            return vscode.window.showErrorMessage(`取消保存`);
        }

        writeFile(uri.fsPath, bookData, (err) => {
            this._loading = undefined;
            // this._opc && this._opc.hide();
            console.log(err);
            if (err) {
                vscode.window.showErrorMessage(`保存失败`);
            }
        })
        // const content = await readerDriver.getContent(chapters[0]);
        // const $ = cheerio.load(content);
        // console.log($("#app > .content").text());
    }

    private static getContext(chapterNode: TreeNode): Promise<string> {
        return new Promise((resolve: (v: string)=>void) => {
            readerDriver.getContent(chapterNode)
            .then((_html: string) => {
                const $ = cheerio.load(_html);
                resolve($("#app > .content").text());
            })
            .catch(() => {
                resolve("章节加载失败")
            })
        })
    }

    private static showOutMsg(msg: string) {
        if (!this._opc) {
            this._opc = vscode.window.createOutputChannel("z-reader-download");
            this._opc.show();
        }

        this._opc.clear();
        this._opc.appendLine(msg);
    }
}