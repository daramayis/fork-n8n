import {
	readFile as fsReadFile,
} from 'fs/promises';

import { IExecuteFunctions } from 'n8n-core';
import {
	IExecuteWorkflowInfo,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IWorkflowBase,
	NodeOperationError,
} from 'n8n-workflow';

import { NodeExecuteFunctions } from 'n8n-core';

const request = NodeExecuteFunctions.requestPromiseWithDefaults;

export class ExecuteWorkflow implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Execute Workflow',
		name: 'executeWorkflow',
		icon: 'fa:network-wired',
		group: ['transform'],
		version: 1,
		subtitle: '={{"Workflow: " + $parameter["workflowId"]}}',
		description: 'Execute another workflow',
		defaults: {
			name: 'Execute Workflow',
			color: '#ff6d5a',
		},
		inputs: ['main'],
		outputs: ['main'],
		properties: [
			{
				displayName: 'Source',
				name: 'source',
				type: 'options',
				options: [
					{
						name: 'Database',
						value: 'database',
						description: 'Load the workflow from the database by ID.',
					},
					{
						name: 'Local File',
						value: 'localFile',
						description: 'Load the workflow from a locally saved file.',
					},
					{
						name: 'Parameter',
						value: 'parameter',
						description: 'Load the workflow from a parameter.',
					},
					{
						name: 'URL',
						value: 'url',
						description: 'Load the workflow from an URL.',
					},
				],
				default: 'database',
				description: 'Where to get the workflow to execute from.',
			},

			// ----------------------------------
			//         source:database
			// ----------------------------------
			{
				displayName: 'Workflow ID',
				name: 'workflowId',
				type: 'options',
				typeOptions: {
					loadOptionsDependsOn: [
						'source',
					],
					loadOptionsMethod: 'getWorkflows',
				},
				displayOptions: {
					show: {
						source: [
							'database',
						],
					},
				},
				default: '',
				required: true,
				description: 'The workflow to execute.',
			},

			// ----------------------------------
			//         source:localFile
			// ----------------------------------
			{
				displayName: 'Workflow Path',
				name: 'workflowPath',
				type: 'string',
				displayOptions: {
					show: {
						source: [
							'localFile',
						],
					},
				},
				default: '',
				placeholder: '/data/workflow.json',
				required: true,
				description: 'The path to local JSON workflow file to execute.',
			},

			// ----------------------------------
			//         source:parameter
			// ----------------------------------
			{
				displayName: 'Workflow JSON',
				name: 'workflowJson',
				type: 'string',
				typeOptions: {
					alwaysOpenEditWindow: true,
					editor: 'code',
					rows: 10,
				},
				displayOptions: {
					show: {
						source: [
							'parameter',
						],
					},
				},
				default: '\n\n\n',
				required: true,
				description: 'The workflow JSON code to execute.',
			},

			// ----------------------------------
			//         source:url
			// ----------------------------------
			{
				displayName: 'Workflow URL',
				name: 'workflowUrl',
				type: 'string',
				displayOptions: {
					show: {
						source: [
							'url',
						],
					},
				},
				default: '',
				placeholder: 'https://example.com/workflow.json',
				required: true,
				description: 'The URL from which to load the workflow from.',
			},
		],
	};

	methods = {
		loadOptions: {
			async getWorkflows(this: ILoadOptionsFunctions) {
				const requestOptions = {
					headers: {
						'accept': 'application/json',
					},
					method: 'GET',
					uri: `${this.getRestApiUrl()}/workflows`,
					json: true,
				};

				const response = await request(requestOptions) as {
					data: Array<{ id: string; name: string; }>
				};

				return response.data.map(({ id, name }) => ({ name: `${id} - ${name}`, value: id }));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const source = this.getNodeParameter('source', 0) as string;

		const workflowInfo: IExecuteWorkflowInfo = {};
		if (source === 'database') {
			// Read workflow from database
			workflowInfo.id = this.getNodeParameter('workflowId', 0) as string;

		} else if (source === 'localFile') {
			// Read workflow from filesystem
			const workflowPath = this.getNodeParameter('workflowPath', 0) as string;

			let workflowJson;
			try {
				workflowJson = await fsReadFile(workflowPath, { encoding: 'utf8' }) as string;
			} catch (error) {
				if (error.code === 'ENOENT') {
					throw new NodeOperationError(this.getNode(), `The file "${workflowPath}" could not be found.`);
				}

				throw error;
			}

			workflowInfo.code = JSON.parse(workflowJson) as IWorkflowBase;
		} else if (source === 'parameter') {
			// Read workflow from parameter
			const workflowJson = this.getNodeParameter('workflowJson', 0) as string;
			workflowInfo.code = JSON.parse(workflowJson) as IWorkflowBase;

		} else if (source === 'url') {
			// Read workflow from url
			const workflowUrl = this.getNodeParameter('workflowUrl', 0) as string;

			const requestOptions = {
				headers: {
					'accept': 'application/json,text/*;q=0.99',
				},
				method: 'GET',
				uri: workflowUrl,
				json: true,
				gzip: true,
			};

			const response = await this.helpers.request(requestOptions);
			workflowInfo.code = response;

		}

		const receivedData = await this.executeWorkflow(workflowInfo, items);

		return receivedData;
	}
}
