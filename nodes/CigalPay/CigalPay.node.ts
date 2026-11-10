import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

export const CHECKOUT_URL = 'https://coins-api.cigalpay.com';
export const API_URL = 'https://core-api.cigalpay.com';
export const MERCHANT_API_URL = 'https://merchant-api.cigalpay.com';

/** Largest payment CigalPay accepts, in USD or EUR. */
const MAX_AMOUNT = 5000;

export class CigalPay implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'CigalPay',
		name: 'cigalPay',
		icon: 'file:cigalpay.png',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Accept crypto payments with CigalPay: checkouts, payments, refunds',
		defaults: { name: 'CigalPay' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'cigalPayApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Checkout', value: 'checkout' },
					{ name: 'Coin', value: 'coin' },
					{ name: 'Payment', value: 'payment' },
					{ name: 'Refund', value: 'refund' },
				],
				default: 'checkout',
			},

			// ── Checkout ──────────────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['checkout'] } },
				options: [
					{
						name: 'Create',
						value: 'create',
						action: 'Create a checkout',
						description: 'Create a payment priced in USD or EUR and get the link to send your customer to',
					},
				],
				default: 'create',
			},
			{
				displayName: 'Amount',
				name: 'amount',
				type: 'number',
				typeOptions: { minValue: 0.01, maxValue: MAX_AMOUNT, numberPrecision: 2 },
				default: 10,
				required: true,
				displayOptions: { show: { resource: ['checkout'], operation: ['create'] } },
				description: 'Price in the chosen currency, up to 5,000',
			},
			{
				displayName: 'Currency',
				name: 'currency',
				type: 'options',
				options: [
					{ name: 'USD', value: 'USD' },
					{ name: 'EUR', value: 'EUR' },
				],
				default: 'USD',
				displayOptions: { show: { resource: ['checkout'], operation: ['create'] } },
			},
			{
				displayName: 'Order ID',
				name: 'orderId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { resource: ['checkout'], operation: ['create'] } },
				description: 'Your own reference. Sent back as "extraId" in payment notifications.',
			},
			{
				displayName: 'Description',
				name: 'checkoutDescription',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { resource: ['checkout'], operation: ['create'] } },
				description: 'Shown to the customer on the checkout',
			},
			{
				displayName: 'Return URL',
				name: 'returnUrl',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'https://example.com/thanks',
				displayOptions: { show: { resource: ['checkout'], operation: ['create'] } },
				description: 'Where the customer goes after paying',
			},
			{
				displayName: 'Notification URL',
				name: 'notifyUrl',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'https://your-n8n.example.com/webhook/...',
				displayOptions: { show: { resource: ['checkout'], operation: ['create'] } },
				description:
					'Where CigalPay sends signed payment notifications. Use the production URL of a CigalPay Trigger node to run a workflow when the payment is made.',
			},
			{
				displayName: 'Checkout Language',
				name: 'lang',
				type: 'options',
				options: [
					{ name: 'English', value: 'en' },
					{ name: 'French', value: 'fr' },
					{ name: 'German', value: 'de' },
					{ name: 'Spanish', value: 'es' },
				],
				default: 'en',
				displayOptions: { show: { resource: ['checkout'], operation: ['create'] } },
			},

			// ── Payment ───────────────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['payment'] } },
				options: [
					{ name: 'Get', value: 'get', action: 'Get a payment', description: 'Get a payment by its ID' },
					{
						name: 'Get by Order',
						value: 'getByOrder',
						action: 'Get the payments of an order',
						description: 'Every payment created for one of your order references',
					},
					{
						name: 'Get Active',
						value: 'getActive',
						action: 'Get active payments',
						description: 'Payments still waiting for funds',
					},
				],
				default: 'get',
			},
			{
				displayName: 'Payment ID',
				name: 'paymentId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { resource: ['payment'], operation: ['get'] } },
				description: 'The "ID" field of a payment notification',
			},
			{
				displayName: 'Order ID',
				name: 'orderId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { resource: ['payment'], operation: ['getByOrder'] } },
			},

			// ── Refund ────────────────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['refund'] } },
				options: [
					{
						name: 'Create',
						value: 'create',
						action: 'Refund a payment',
						description:
							'Refund a paid payment in the coin the customer paid. The customer gets a link to enter their address.',
					},
					{ name: 'Get Many', value: 'getAll', action: 'Get the refunds of a payment' },
				],
				default: 'create',
			},
			{
				displayName: 'Payment ID',
				name: 'paymentId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { resource: ['refund'] } },
				description: 'The "ID" field of the payment notification',
			},
			{
				displayName: 'Amount In',
				name: 'amountIn',
				type: 'options',
				options: [
					{ name: 'Checkout Currency (USD / EUR)', value: 'checkout' },
					{ name: 'Coin Paid', value: 'coin' },
				],
				default: 'checkout',
				displayOptions: { show: { resource: ['refund'], operation: ['create'] } },
			},
			{
				displayName: 'Amount',
				name: 'amount',
				type: 'number',
				typeOptions: { minValue: 0, numberPrecision: 8 },
				default: 0,
				required: true,
				displayOptions: { show: { resource: ['refund'], operation: ['create'] } },
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show: { resource: ['refund'], operation: ['create'] } },
				options: [
					{
						displayName: 'Customer Email',
						name: 'customerEmail',
						type: 'string',
						placeholder: 'name@email.com',
						default: '',
						description: 'Gets the link to enter their address',
					},
					{ displayName: 'Reason', name: 'reason', type: 'string', default: '' },
				],
			},

			// ── Coin ──────────────────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['coin'] } },
				options: [
					{ name: 'Get Accepted', value: 'getAccepted', action: 'Get the coins accepted directly' },
					{ name: 'Get Converted', value: 'getConverted', action: 'Get the coins converted at payment' },
				],
				default: 'getAccepted',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const out: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const data = await run.call(this, resource, operation, i);
				const rows = Array.isArray(data) ? data : [data];
				for (const row of rows) out.push({ json: (row ?? {}) as IDataObject, pairedItem: { item: i } });
			} catch (error) {
				if (this.continueOnFail()) {
					out.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				throw error;
			}
		}
		return [out];
	}
}

async function request(
	this: IExecuteFunctions,
	method: IHttpRequestMethods,
	url: string,
	body?: IDataObject,
	authenticated = true,
): Promise<unknown> {
	const options: IHttpRequestOptions = { method, url, json: true, headers: { Accept: 'application/json' } };
	if (body) options.body = body;
	try {
		return authenticated
			? await this.helpers.httpRequestWithAuthentication.call(this, 'cigalPayApi', options)
			: await this.helpers.httpRequest(options);
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

async function run(this: IExecuteFunctions, resource: string, operation: string, i: number): Promise<unknown> {
	if (resource === 'checkout' && operation === 'create') {
		const credentials = await this.getCredentials('cigalPayApi');
		const amount = this.getNodeParameter('amount', i) as number;
		if (!(amount > 0) || amount > MAX_AMOUNT) {
			throw new NodeOperationError(this.getNode(), `The amount must be between 0.01 and ${MAX_AMOUNT}`, { itemIndex: i });
		}
		return request.call(
			this,
			'POST',
			`${CHECKOUT_URL}/api/pre-invoice`,
			{
				accountId: credentials.accountId as string,
				amount,
				currency: this.getNodeParameter('currency', i) as string,
				extraId: String(this.getNodeParameter('orderId', i)),
				description: this.getNodeParameter('checkoutDescription', i) as string,
				lang: this.getNodeParameter('lang', i) as string,
				callback: this.getNodeParameter('returnUrl', i) as string,
				ipn: this.getNodeParameter('notifyUrl', i) as string,
			},
			false,
		);
	}

	if (resource === 'payment') {
		if (operation === 'get') {
			const id = encodeURIComponent(this.getNodeParameter('paymentId', i) as string);
			return request.call(this, 'GET', `${API_URL}/getPaymentStatus?id=${id}`);
		}
		if (operation === 'getByOrder') {
			const orderId = encodeURIComponent(String(this.getNodeParameter('orderId', i)));
			return request.call(this, 'GET', `${API_URL}/getPaymentsByExtraId?extraId=${orderId}`);
		}
		if (operation === 'getActive') return request.call(this, 'GET', `${API_URL}/activePayments`);
	}

	if (resource === 'refund') {
		const paymentId = String(this.getNodeParameter('paymentId', i));
		if (operation === 'create') {
			const amount = this.getNodeParameter('amount', i) as number;
			if (!(amount > 0)) throw new NodeOperationError(this.getNode(), 'Enter the amount to refund', { itemIndex: i });
			const extra = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
			const body: IDataObject = { paymentId };
			body[this.getNodeParameter('amountIn', i) === 'coin' ? 'amount' : 'checkoutAmount'] = amount;
			if (extra.customerEmail) body.customerEmail = extra.customerEmail;
			if (extra.reason) body.reason = extra.reason;
			return request.call(this, 'POST', `${MERCHANT_API_URL}/api/refunds`, body);
		}
		if (operation === 'getAll') {
			return request.call(this, 'GET', `${MERCHANT_API_URL}/api/refunds?paymentId=${encodeURIComponent(paymentId)}`);
		}
	}

	if (resource === 'coin') {
		if (operation === 'getAccepted') return request.call(this, 'GET', `${API_URL}/supportedCoins`, undefined, false);
		if (operation === 'getConverted') return request.call(this, 'GET', `${API_URL}/swapCurrencies`, undefined, false);
	}

	throw new NodeOperationError(this.getNode(), `Unsupported operation: ${resource} / ${operation}`, { itemIndex: i });
}
