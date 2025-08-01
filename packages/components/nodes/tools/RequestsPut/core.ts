import { z } from 'zod'
import fetch from 'node-fetch'
import { DynamicStructuredTool } from '../OpenAPIToolkit/core'
import { checkDenyList } from '../../../src/httpSecurity'

export const desc = `Use this when you want to execute a PUT request to update or replace a resource.`

export interface Headers {
    [key: string]: string
}

export interface Body {
    [key: string]: any
}

export interface RequestParameters {
    headers?: Headers
    body?: Body
    url?: string
    description?: string
    name?: string
    bodySchema?: string
    maxOutputLength?: number
}

// Base schema for PUT request
const createRequestsPutSchema = (bodySchema?: string) => {
    // If bodySchema is provided, parse it and add dynamic body params
    if (bodySchema) {
        try {
            const parsedSchema = JSON.parse(bodySchema)
            const bodyParamsObject: Record<string, z.ZodTypeAny> = {}

            Object.entries(parsedSchema).forEach(([key, config]: [string, any]) => {
                let zodType: z.ZodTypeAny = z.string()

                // Handle different types
                if (config.type === 'number') {
                    zodType = z.number()
                } else if (config.type === 'boolean') {
                    zodType = z.boolean()
                } else if (config.type === 'object') {
                    zodType = z.record(z.any())
                } else if (config.type === 'array') {
                    zodType = z.array(z.any())
                }

                // Add description
                if (config.description) {
                    zodType = zodType.describe(config.description)
                }

                // Make optional if not required
                if (!config.required) {
                    zodType = zodType.optional()
                }

                bodyParamsObject[key] = zodType
            })

            if (Object.keys(bodyParamsObject).length > 0) {
                return z.object({
                    body: z.object(bodyParamsObject).describe('Request body parameters')
                })
            }
        } catch (error) {
            console.warn('Failed to parse bodySchema:', error)
        }
    }

    // Fallback to generic body
    return z.object({
        body: z.record(z.any()).optional().describe('Optional body data to include in the request')
    })
}

export class RequestsPutTool extends DynamicStructuredTool {
    url = ''
    maxOutputLength = Infinity
    headers = {}
    body = {}
    bodySchema?: string

    constructor(args?: RequestParameters) {
        const schema = createRequestsPutSchema(args?.bodySchema)

        const toolInput = {
            name: args?.name || 'requests_put',
            description: args?.description || desc,
            schema: schema,
            baseUrl: '',
            method: 'PUT',
            headers: args?.headers || {}
        }
        super(toolInput)
        this.url = args?.url ?? this.url
        this.headers = args?.headers ?? this.headers
        this.body = args?.body ?? this.body
        this.maxOutputLength = args?.maxOutputLength ?? this.maxOutputLength
        this.bodySchema = args?.bodySchema
    }

    /** @ignore */
    async _call(arg: any): Promise<string> {
        const params = { ...arg }

        try {
            const inputUrl = this.url
            if (!inputUrl) {
                throw new Error('URL is required for PUT request')
            }

            let inputBody = {
                ...this.body
            }

            if (this.bodySchema && params.body && Object.keys(params.body).length > 0) {
                inputBody = {
                    ...inputBody,
                    ...params.body
                }
            }

            const requestHeaders = {
                'Content-Type': 'application/json',
                ...(params.headers || {}),
                ...this.headers
            }

            // Check if URL is allowed by security policy
            await checkDenyList(inputUrl)

            const res = await fetch(inputUrl, {
                method: 'PUT',
                headers: requestHeaders,
                body: JSON.stringify(inputBody)
            })

            if (!res.ok) {
                throw new Error(`HTTP Error ${res.status}: ${res.statusText}`)
            }

            const text = await res.text()
            return text.slice(0, this.maxOutputLength)
        } catch (error) {
            throw new Error(`Failed to make PUT request: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
    }
}
