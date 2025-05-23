/**
 * OpenAPI schema definition
 */
export interface OpenAPISchema {
  type?: string;
  format?: string;
  minLength?: number;
  maxLength?: number;
  items?: OpenAPISchema;
  properties?: Record<string, OpenAPISchema>;
  required?: boolean | string[];
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
  additionalProperties?: OpenAPISchema;
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
  [key: string]: any;
}

/**
 * OpenAPI path item definition
 */
export interface PathItem {
  [method: string]: Operation;
}

/**
 * OpenAPI operation definition
 */
export interface Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  security?: { [key: string]: string[] }[];
  parameters?: Parameter[];
  requestBody?: {
    content: {
      [contentType: string]: {
        schema: OpenAPISchema;
      };
    };
  };
  responses: {
    [statusCode: string]: {
      description: string;
      content?: {
        [contentType: string]: {
          schema: OpenAPISchema;
        };
      };
    };
  };
}

/**
 * OpenAPI parameter definition
 */
export interface Parameter {
  in: string;
  name: string;
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

/**
 * Route definition with JSDoc comments
 */
export interface RouteDefinition {
  method: string;
  path: string;
  paramsType?: string;
  bodyType?: string;
  responseType?: string;
  jsDoc?: {
    tags: Array<{
      tagName: string;
      content: string;
    }>;
  };
}

/**
 * Schema content for a route
 */
export interface SchemaContent {
  requestBody?: {
    content: {
      [contentType: string]: {
        schema: OpenAPISchema;
      };
    };
  };
  responses: {
    [statusCode: string]: {
      description: string;
      content?: {
        [contentType: string]: {
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