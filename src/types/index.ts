export interface OpenAPISchema {
  type?: string;
  format?: string;
  minLength?: number;
  maxLength?: number;
  items?: OpenAPISchema;
  properties?: Record<string, OpenAPISchema>;
  required?: string[];
  nullable?: boolean;
  description?: string;
  enum?: any[];
  default?: any;
  example?: any;
  $ref?: string;
  allOf?: OpenAPISchema[];
  anyOf?: OpenAPISchema[];
  oneOf?: OpenAPISchema[];
  not?: OpenAPISchema;
  additionalProperties?: boolean | OpenAPISchema;
  minProperties?: number;
  maxProperties?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: boolean;
  exclusiveMaximum?: boolean;
  multipleOf?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  minContains?: number;
  maxContains?: number;
  const?: any;
  contentEncoding?: string;
  contentMediaType?: string;
  contentSchema?: OpenAPISchema;
  if?: OpenAPISchema;
  then?: OpenAPISchema;
  else?: OpenAPISchema;
  dependentSchemas?: Record<string, OpenAPISchema>;
  dependentRequired?: Record<string, string[]>;
  propertyNames?: OpenAPISchema;
  prefixItems?: OpenAPISchema[];
  contains?: OpenAPISchema;
  unevaluatedItems?: OpenAPISchema;
  unevaluatedProperties?: OpenAPISchema;
  discriminator?: {
    propertyName: string;
    mapping?: Record<string, string>;
  };
  xml?: {
    name?: string;
    namespace?: string;
    prefix?: string;
    attribute?: boolean;
    wrapped?: boolean;
  };
  externalDocs?: {
    description?: string;
    url: string;
  };
  deprecated?: boolean;
  title?: string;
  readOnly?: boolean;
  writeOnly?: boolean;
  comment?: string;
}

export interface PathItem {
  get?: Operation;
  put?: Operation;
  post?: Operation;
  delete?: Operation;
  options?: Operation;
  head?: Operation;
  patch?: Operation;
  trace?: Operation;
  parameters?: Parameter[];
}

export interface Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  security?: any[];
  requestBody?: {
    content: {
      "application/json": {
        schema: OpenAPISchema;
      };
    };
  };
  responses: {
    [status: string]: {
      description: string;
      content: {
        "application/json": {
          schema: OpenAPISchema;
        };
      };
    };
  };
  parameters?: Parameter[];
}

export interface Parameter {
  name: string;
  in: "query" | "header" | "path" | "cookie";
  description?: string;
  required?: boolean;
  schema: OpenAPISchema;
}

export interface Params {
  properties: Record<string, Property>;
  required?: string[];
}

export interface Property {
  in: "query" | "header" | "path" | "cookie";
  name: string;
  schema: OpenAPISchema;
  required?: boolean;
  description?: string;
}

export interface OpenApiConfig {
  title: string;
  version: string;
  description?: string;
  servers?: { url: string; description?: string }[];
  securitySchemes?: Record<string, any>;
}

export interface RouteDefinition {
  method: string;
  path: string;
  handler: Function;
  paramsType?: string;
  bodyType?: string;
  responseType?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  security?: any[];
  operationId?: string;
  requestBody?: {
    content: {
      "application/json": {
        schema: OpenAPISchema;
      };
    };
  };
  responses?: {
    [status: string]: {
      description: string;
      content: {
        "application/json": {
          schema: OpenAPISchema;
        };
      };
    };
  };
  parameters?: Parameter[];
}

export interface SchemaContent {
  requestBody?: {
    content: {
      "application/json": {
        schema: OpenAPISchema;
      };
    };
  };
  responses: {
    [status: string]: {
      description: string;
      content: {
        "application/json": {
          schema: OpenAPISchema;
        };
      };
    };
  };
  params: Params;
}

export interface SchemaProcessor {
  getSchemaContent(params: {
    paramsType?: string;
    bodyType?: string;
    responseType?: string;
  }): SchemaContent;
} 