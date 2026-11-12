import { createHmac, timingSafeEqual } from 'crypto';
import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

const PAID = ['CONFIRMED', 'FINISHED'];

/**
 * The string CigalPay signs: the notification as JSON with its top-level keys
 * sorted (JSON.stringify's key list), HMAC-SHA512 with the signing secret.
 * Same check as the CigalPay SDKs' verifyWebhook.
 */
export function verifySignature(payload: unknown, signature: string, secret: string): boolean {
	if (!signature || !secret || !payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
	const signed = JSON.stringify(payload, Object.keys(payload as object).sort());
	const expected = createHmac('sha512', secret).update(signed).digest('hex');
	return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export class CigalPayTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'CigalPay Trigger',
		name: 'cigalPayTrigger',
		icon: { light: 'file:../../icons/cigalpay.svg', dark: 'file:../../icons/cigalpay.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["statuses"] === "paid" ? "Paid payments" : "Payment updates"}}',
		description: 'Starts the workflow when CigalPay sends a signed payment notification',
		defaults: { name: 'CigalPay Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'cigalPayApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				responseData: 'noData',
				path: 'cigalpay',
			},
		],
		properties: [
			{
				displayName: 'Trigger On',
				name: 'statuses',
				type: 'options',
				options: [
					{ name: 'All Status Changes', value: 'all', description: 'Waiting, confirming, partly paid, expired, paid' },
					{ name: 'Paid Payments Only', value: 'paid', description: 'Status CONFIRMED or FINISHED: safe to deliver' },
					{ name: 'Selected Statuses', value: 'selected' },
				],
				default: 'paid',
				description:
					'Which notifications start the workflow. CigalPay sends them to the Notification URL of each checkout: use this node\'s production URL there (CigalPay node or API).',
			},
			{
				displayName: 'Statuses',
				name: 'selectedStatuses',
				type: 'multiOptions',
				options: [
					{ name: 'Confirmed', value: 'CONFIRMED' },
					{ name: 'Confirming', value: 'CONFIRMING' },
					{ name: 'Expired', value: 'EXPIRED' },
					{ name: 'Failed', value: 'FAILED' },
					{ name: 'Finished', value: 'FINISHED' },
					{ name: 'Partially Paid', value: 'PARTIALLY_PAID' },
					{ name: 'Sending', value: 'SENDING' },
					{ name: 'Waiting', value: 'WAITING' },
				],
				default: ['CONFIRMED', 'FINISHED'],
				displayOptions: { show: { statuses: ['selected'] } },
			},
			{
				displayName: 'Ignore Test Notifications',
				name: 'ignoreTests',
				type: 'boolean',
				default: false,
				description: 'Whether to skip the samples sent by Settings → API credentials → Test notification in the CigalPay dashboard',
			},
		],
	};

	// CigalPay has no webhook registry: the notification URL is given with each
	// checkout (CigalPay node or API), so there is nothing to create or delete.
	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				return true;
			},
			async create(this: IHookFunctions): Promise<boolean> {
				return true;
			},
			async delete(this: IHookFunctions): Promise<boolean> {
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const res = this.getResponseObject();
		const credentials = await this.getCredentials('cigalPayApi');
		const body = this.getBodyData();
		const signature = String(this.getHeaderData()['x-cigalpay-sig'] ?? '');

		// Only CigalPay knows the signing secret: anything else is refused before the workflow runs.
		if (!verifySignature(body, signature, String(credentials.notificationSecret ?? ''))) {
			res.status(401).json({ error: 'Bad or missing signature' });
			return { noWebhookResponse: true };
		}

		const status = String(body.status ?? '');
		const mode = this.getNodeParameter('statuses') as string;
		const wanted =
			mode === 'all' ? true : mode === 'paid' ? PAID.includes(status) : (this.getNodeParameter('selectedStatuses') as string[]).includes(status);
		const isTest = body.test === true;

		if (!wanted || (isTest && (this.getNodeParameter('ignoreTests') as boolean))) {
			return { webhookResponse: 'OK' };
		}

		return {
			webhookResponse: 'OK',
			workflowData: [
				this.helpers.returnJsonArray({
					...(body as IDataObject),
					isPaid: PAID.includes(status),
					receivedAt: new Date().toISOString(),
				}),
			],
		};
	}
}
