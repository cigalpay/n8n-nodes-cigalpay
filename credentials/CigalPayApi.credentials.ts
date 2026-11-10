import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, Icon, INodeProperties } from 'n8n-workflow';

/** CigalPay dashboard → Settings → API credentials. */
export class CigalPayApi implements ICredentialType {
	name = 'cigalPayApi';

	displayName = 'CigalPay API';

	icon: Icon = { light: 'file:../icons/cigalpay.svg', dark: 'file:../icons/cigalpay.dark.svg' };

	documentationUrl = 'https://cigalpay.com/developers';

	properties: INodeProperties[] = [
		{
			displayName: 'Account ID',
			name: 'accountId',
			type: 'string',
			default: '',
			required: true,
			description: 'CigalPay dashboard → Settings → API credentials',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'For payments and refunds. Created in Settings → API credentials and shown once.',
		},
		{
			displayName: 'Notification Signing Secret',
			name: 'notificationSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'Used by the CigalPay Trigger to check that notifications come from CigalPay',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: { 'cigalpay-api-key': '={{$credentials.apiKey}}' },
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://core-api.cigalpay.com',
			url: '/activePayments',
		},
	};
}
