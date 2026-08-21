export type FieldName = 'title' | 'price' | 'currency' | 'availability' | 'url'

export type FieldSpec = {
  name: FieldName
  path: string
  fallbackPaths?: string[]
  transform?: 'trim' | 'toNumber' | 'parseStock'
  type: 'string' | 'number' | 'boolean' | 'url'
  required: boolean
}

export type Assertions = {
  minItems: number
  fieldFillRate: Partial<Record<FieldName, number>>
  priceRange?: [number, number]
  expectVaried?: FieldName[]
}

export type PayloadContract = {
  version: number
  targetId: string
  fields: FieldSpec[]
  assertions: Assertions
}

export type ExtractedRecord = {
  key: string
  title?: string
  price?: number
  currency?: string
  inStock?: boolean
  url?: string
  raw: Record<string, unknown>
}

export type Issue = {
  index: number
  field: FieldName
  kind: 'missing' | 'type'
  detail: string
}
