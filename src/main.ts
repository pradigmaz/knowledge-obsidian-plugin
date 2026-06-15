import { Plugin } from 'obsidian';
import { KnowledgeServer } from './api/server';

export default class KnowledgePlugin extends Plugin {
	apiServer: KnowledgeServer | null = null;

	async onload() {
		this.apiServer = new KnowledgeServer(this.app, this.manifest.version);
		this.apiServer.start();
	}

	onunload() {
		if (this.apiServer) {
			this.apiServer.stop();
			this.apiServer = null;
		}
	}
}
