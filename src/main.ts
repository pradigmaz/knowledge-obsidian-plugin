import { Plugin } from 'obsidian';
import { KnowledgeServer } from './api/server';

export default class KnowledgePlugin extends Plugin {
	apiServer: KnowledgeServer | null = null;

	async onload() {
		console.log('Knowledge Analytics Plugin loading...');
		this.apiServer = new KnowledgeServer(this.app);
		this.apiServer.start();
	}

	onunload() {
		if (this.apiServer) {
			this.apiServer.stop();
			this.apiServer = null;
		}
		console.log('Knowledge Analytics Plugin unloaded');
	}
}
