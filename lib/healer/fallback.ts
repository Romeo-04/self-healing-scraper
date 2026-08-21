import OpenAI from 'openai'
import { optionalEnv, requireEnv } from '../env.ts'
import { buildHealPrompt } from './prompt.ts'
import type { PayloadContract } from '../contracts/types.ts'
import type { DriftVerdict } from '../sensor/index.ts'

const CONTRACT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['fields'],
  properties: {
    fields: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'path', 'fallbackPaths', 'transform', 'type', 'required'],
        properties: {
          name: { type: 'string', enum: ['title', 'price', 'currency', 'availability', 'url'] },
          path: { type: 'string' },
          fallbackPaths: { type: ['array', 'null'], items: { type: 'string' } },
          transform: { type: ['string', 'null'], enum: ['trim', 'toNumber', 'parseStock', null] },
          type: { type: 'string', enum: ['string', 'number', 'boolean', 'url'] },
          required: { type: 'boolean' },
        },
      },
    },
  },
} as const

// Strict mode forces every property to be present, so optional FieldSpec keys
// (fallbackPaths, transform) come back as explicit `null` rather than absent.
// FieldSpec declares them optional, not nullable, so a null must be stripped
// before the object is treated as a FieldSpec — otherwise it both violates the
// type and feeds `null` into applyTransform, which silently no-ops instead of
// transforming the value.
function stripNulls(field: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(field)) {
    if (value !== null) out[key] = value
  }
  return out
}

export async function proposeContract(args: {
  contract: PayloadContract
  verdict: DriftVerdict
  sample: unknown[]
}): Promise<PayloadContract> {
  const client = new OpenAI({ apiKey: requireEnv('OPENAI_API_KEY') })
  const model = requireEnv('OPENAI_MODEL')

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content:
        'You repair JSON field mappings. The scraper payload shape is fixed; only the ' +
        'field paths and transforms may change. Return only the fields array.' },
      { role: 'user', content:
        `${buildHealPrompt(args)}\n\nCurrent mapping:\n${JSON.stringify(args.contract.fields, null, 2)}` },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'payload_contract_fields', strict: true, schema: CONTRACT_SCHEMA },
    },
  })

  const content = response.choices[0]?.message.content
  if (content === null || content === undefined) throw new Error('fallback repair returned no content')
  const parsed = JSON.parse(content) as { fields: Array<Record<string, unknown>> }
  const fields = parsed.fields.map(stripNulls) as unknown as PayloadContract['fields']

  // The schema does not require every field name, and the contract's
  // fieldFillRate assertion covers only a subset (title, price, url) -- so a
  // candidate that simply deletes a field like `availability` would otherwise
  // sail through the gate unnoticed. Verify nothing present in the original
  // contract went missing.
  const proposedNames = new Set(fields.map(f => f.name))
  const droppedNames = args.contract.fields.map(f => f.name).filter(name => !proposedNames.has(name))
  if (droppedNames.length > 0) {
    throw new Error(`fallback repair dropped field(s): ${droppedNames.join(', ')}`)
  }

  return {
    ...args.contract,
    version: args.contract.version + 1,
    fields,
  }
}

export function fallbackModelName(): string {
  return optionalEnv('OPENAI_MODEL', '(unset)')
}
