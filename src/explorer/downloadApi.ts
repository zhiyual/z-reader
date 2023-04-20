/* eslint-disable prefer-const */
import * as vscode from 'vscode';
import * as cheerio from 'cheerio';
import { readerDriver } from '../reader';
import { TreeNode } from './TreeNode';
import { writeFile } from 'fs';
import workspaceConfiguration from '../utils/workspaceConfiguration';

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

        // while (_index < _maxCp) {
        //     let _node = chapters[_index];
        //     // let _title = _node.name;
        //     _bookData.push(_node.name);
        //     let _art = await this.getContext(_node);
        //     _bookData.push(_art);
        //     _index++;

        //     _opcMsg[0] = `${_index + 1} / ${_maxCp}`;
        //     this.showOutMsg([..._opcMsg].reverse().join("\n"));
        // }
        const _tool = new DownLoadTool();
        _tool.addChangeListener((cur: number, max: number) => {
            _opcMsg[0] = `${cur} / ${max}`;
            this.showOutMsg([..._opcMsg].reverse().join("\n"));
        }, this);
        _tool.init(chapters);

        let _rsl = await _tool.downLoad();

        for (let i = 0; i < _rsl.length; i++) {
            const element = _rsl[i];
            _bookData.push(element.title);
            _bookData.push(element.context);
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


class DownLoadTool {
    constructor() {
        this._chapters = [];
        this._maxLine = workspaceConfiguration().get("downloadThreads", 10);
        this._inloading = 0;
        this._loadIndex = 0;
        this._completeNum = 0;
        this._datas = [];
        this._onChange = undefined;
        this._callObj = undefined;
    }

    private _maxLine: number;
    private _chapters: TreeNode[];
    private _inloading: number;
    private _datas: {title: string, context: string}[];
    private _onChange: ((cur: number, max: number)=>void) | undefined;
    private _callObj: any;

    private _loadCompleteCall: (()=>void) | undefined;
    private _loadIndex: number;
    private _completeNum: number;

    public addChangeListener(call: (cur: number, max: number)=>void, callObj: any) {
        this._onChange = call;
        this._callObj = callObj;
    }

    public init(chapters: TreeNode[]) {
        this._chapters = [...chapters];
        this._inloading = 0;
        this._loadIndex = 0;
        this._datas = [];
        this._completeNum = 0;
    }

    public async downLoad(): Promise<Array<{title: string, context: string}>> {
        return new Promise((resolve: (data: {title: string, context: string}[])=>void) => {
            this._loadCompleteCall = () => {
                resolve(this._datas);
            }

            this.checkLoadStart();
        })
    }

    private checkLoadStart() {
        for (let i = 0; i < this._maxLine; i++) {
            this.getContext(i);
        }
    }

    private loadEnd(index: number, context: string) {

        this._datas[index] = {
            title: this._chapters[index].name,
            context: context
        }

        this._completeNum++;

        if (this._onChange && this._callObj) {
            this._onChange.apply(this._callObj, [this._completeNum, this._chapters.length]);
        }

        this._inloading--;

        if (this._loadIndex == this._chapters.length) {
            if (this._inloading == 0) {
                this._loadCompleteCall && this._loadCompleteCall();
            }
            
            return;
        }

        this.getContext(this._loadIndex);
    }
    
    private getContext(index: number) {
        this._inloading++;
        this._loadIndex++;

        if (index == this._chapters.length) {
            this.loadEnd(index, "章节加载失败");
        }

        readerDriver.getContent(this._chapters[index])
        .then((_html: string) => {
            const $ = cheerio.load(_html);
            // resolve($("#app > .content").text());
            const _ctx = $("#app > .content").text();
            this.loadEnd(index, _ctx);
        })
        .catch(() => {
            // resolve("章节加载失败")
            this.loadEnd(index, "章节加载失败");
        })
    }

}