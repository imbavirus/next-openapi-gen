import fs from "fs";
import path from "path";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";

import { Params, Property } from "../types";

// Define the base schema properties
interface BaseSchema {
  type?: string;
  format?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  default?: any;
  description?: string;
  nullable?: boolean;
  items?: OpenAPISchema;
  properties?: Record<string, OpenAPISchema>;
  required?: boolean | string[];
  anyOf?: OpenAPISchema[];
  allOf?: OpenAPISchema[];
  oneOf?: OpenAPISchema[];
  enum?: any[];
  additionalProperties?: OpenAPISchema;
  discriminator?: {
    propertyName: string;
  };
  [key: string]: any;
}

// Combine Property and BaseSchema
interface OpenAPISchema extends BaseSchema {
  in?: string;
  name?: string;
  schema?: BaseSchema;
}

export class SchemaProcessor {
  private schemaDir: string;
  private typeDefinitions: any = {};
  private openapiDefinitions: Record<string, OpenAPISchema> = {};
  private contentType: string = "";
  private processedSchemas: Set<string> = new Set();

  constructor(schemaDir: string) {
    this.schemaDir = path.resolve(schemaDir);
  }

  public findSchemaDefinition(schemaName: string, contentType: string) {
    console.log('🔎 Finding schema definition:', schemaName);
    let schemaNode: t.Node | null = null;
    this.contentType = contentType;
    this.scanSchemaDir(this.schemaDir, schemaName);
    return schemaNode;
  }

  private scanSchemaDir(dir: string, schemaName: string) {
    const files = fs.readdirSync(dir);
    files.forEach((file) => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        this.scanSchemaDir(filePath, schemaName);
      } else if (file.endsWith(".ts")) {
        this.processSchemaFile(filePath, schemaName);
      }
    });
  }

  private processSchemaFile(filePath: string, schemaName: string) {
    console.log('📄 Processing schema file:', filePath);
    
    // Skip empty schema names
    if (!schemaName) {
      console.log('⚠️ Skipping empty schema name');
      return;
    }

    // Ensure schema name has Schema suffix
    const schemaNameWithSuffix = schemaName.endsWith('Schema') ? schemaName : `${schemaName}Schema`;
    
    // Check if file contains the schema we're looking for
    const content = fs.readFileSync(filePath, "utf-8");
    if (content.includes(schemaNameWithSuffix)) {
      console.log('🔍 Found schema definition in file:', schemaNameWithSuffix);
      const ast = parse(content, {
        sourceType: "module",
        plugins: ["typescript", "decorators-legacy"],
      });

      // First collect type definitions
      this.collectTypeDefinitions(ast, schemaNameWithSuffix);

      // If we already have a processed schema, use it
      if (this.openapiDefinitions[schemaNameWithSuffix]) {
        console.log('✅ Using existing processed schema for:', schemaNameWithSuffix);
        console.log('📄 Existing schema content:', this.openapiDefinitions[schemaNameWithSuffix]);
        return;
      }

      // Otherwise try to resolve the type
      const definition = this.resolveType(schemaNameWithSuffix);
      if (definition && Object.keys(definition).length > 0) {
        console.log('💾 Storing schema definition for:', schemaNameWithSuffix);
        this.openapiDefinitions[schemaNameWithSuffix] = definition;
        this.processedSchemas.add(schemaNameWithSuffix);
        console.log('📄 Stored schema content:', definition);
      } else {
        console.log('⚠️ Could not resolve schema definition for:', schemaNameWithSuffix);
      }
    }
  }

  private collectTypeDefinitions(ast: any, schemaName: string) {
    if (!!this.typeDefinitions[schemaName]) return;
    
    console.log('📝 Collecting type definitions for:', schemaName);
    traverse.default(ast, {
      VariableDeclarator: (path) => {
        if (t.isIdentifier(path.node.id, { name: schemaName })) {
          console.log('✅ Found variable declaration for:', schemaName);
          const name = path.node.id.name;
          this.typeDefinitions[name] = path.node.init || path.node;
          
          // If this is a Zod schema, process it immediately
          if (path.node.init && t.isCallExpression(path.node.init)) {
            console.log('🔍 Processing Zod schema definition');
            const schema = this.processZodType(path.node.init);
            if (schema && Object.keys(schema).length > 0) {
              console.log('💾 Storing processed schema:', schema);
              this.openapiDefinitions[name] = schema;
              this.processedSchemas.add(name);
              console.log('📄 Stored schema content:', schema);
            } else {
              console.log('⚠️ Processed schema is empty');
            }
          }
        }
      },
      TSTypeAliasDeclaration: (path) => {
        if (t.isIdentifier(path.node.id, { name: schemaName }) && path.node.typeAnnotation?.typeName?.right?.name !== 'infer') {
          console.log('✅ Found type alias for:', schemaName);
          const name = path.node.id.name;
          this.typeDefinitions[name] = path.node.typeAnnotation;
        }
      },
      TSInterfaceDeclaration: (path) => {
        if (t.isIdentifier(path.node.id, { name: schemaName })) {
          console.log('✅ Found interface for:', schemaName);
          const name = path.node.id.name;
          this.typeDefinitions[name] = path.node;
        }
      },
      TSEnumDeclaration: (path) => {
        if (t.isIdentifier(path.node.id, { name: schemaName })) {
          console.log('✅ Found enum for:', schemaName);
          const name = path.node.id.name;
          this.typeDefinitions[name] = path.node;
        }
      },
    });
  }

  private processZodType(node: any): OpenAPISchema {
    console.log('🔍 Processing Zod Type:', {
      nodeType: node?.type,
      calleeName: node?.callee?.name,
      propertyName: node?.callee?.property?.name,
      arguments: node?.arguments,
      name: node?.name
    });

    if (!node) {
      console.log('⚠️ Empty node received');
      return {};
    }

    // Handle schema references first
    if (node.callee?.name && node.callee.name.endsWith('Schema')) {
      const schemaName = node.callee.name;
      console.log('📚 Found schema reference:', schemaName);
      const referencedSchema = this.getSchemaReference(schemaName);
      if (referencedSchema) {
        return referencedSchema;
      }
    }

    // Handle basic types
    if (node.callee?.property?.name) {
      const typeName = node.callee.property.name;
      console.log('🔧 Processing Zod type:', typeName);
      let schema: OpenAPISchema = {};

      switch (typeName) {
        case "string":
          console.log('📝 Processing string type with args:', node.arguments?.[0]);
          schema = { type: "string" };
          if (node.arguments?.[0]) {
            const validation = node.arguments[0];
            if (validation.min) schema.minLength = validation.min;
            if (validation.max) schema.maxLength = validation.max;
            if (validation.pattern) schema.pattern = validation.pattern;
          }
          break;

        case "number":
          console.log('🔢 Processing number type with args:', node.arguments?.[0]);
          schema = { type: "number" };
          if (node.arguments?.[0]) {
            const validation = node.arguments[0];
            if (validation.min) schema.minimum = validation.min;
            if (validation.max) schema.maximum = validation.max;
          }
          break;

        case "boolean":
          console.log('✅ Processing boolean type');
          schema = { type: "boolean" };
          break;

        case "array":
          console.log('📦 Processing array type with args:', node.arguments);
          // Check if the array items reference another schema
          if (node.arguments?.[0]?.name?.endsWith('Schema')) {
            const refSchemaName = node.arguments[0].name;
            console.log('📚 Found schema reference in array items:', refSchemaName);
            const refSchema = this.getSchemaReference(refSchemaName);
            if (refSchema) {
              console.log('✅ Using referenced schema for array items:', refSchema);
              schema = {
                type: "array",
                items: refSchema
              };
            } else {
              console.log('⚠️ Could not resolve array items schema:', refSchemaName);
              schema = {
                type: "array",
                items: {}
              };
            }
          } else if (node.arguments?.[0]?.callee?.name?.endsWith('Schema')) {
            const refSchemaName = node.arguments[0].callee.name;
            console.log('📚 Found schema reference in array items:', refSchemaName);
            const refSchema = this.getSchemaReference(refSchemaName);
            if (refSchema) {
              console.log('✅ Using referenced schema for array items:', refSchema);
              schema = {
                type: "array",
                items: refSchema
              };
            } else {
              console.log('⚠️ Could not resolve array items schema:', refSchemaName);
              schema = {
                type: "array",
                items: {}
              };
            }
          } else {
            const itemsSchema = this.processZodType(node.arguments?.[0]);
            console.log('✅ Using processed schema for array items:', itemsSchema);
            schema = {
              type: "array",
              items: itemsSchema
            };
          }
          if (node.arguments?.[1]) {
            const validation = node.arguments[1];
            if (validation.min) schema.minItems = validation.min;
            if (validation.max) schema.maxItems = validation.max;
            if (validation.length) {
              schema.minItems = validation.length;
              schema.maxItems = validation.length;
            }
          }
          break;

        case "nullable":
          console.log('🔄 Processing nullable type');
          schema = { ...this.processZodType(node.arguments?.[0]), nullable: true };
          break;

        case "optional":
          console.log('⚡ Processing optional type');
          schema = { ...this.processZodType(node.arguments?.[0]) };
          break;

        case "default":
          console.log('💫 Processing default value:', node.arguments?.[1]?.value);
          schema = { ...this.processZodType(node.arguments?.[0]) };
          if (node.arguments?.[1]) {
            schema.default = node.arguments[1].value;
          }
          break;

        case "describe":
          console.log('📄 Processing description:', node.arguments?.[1]?.value);
          schema = { ...this.processZodType(node.arguments?.[0]) };
          if (node.arguments?.[1]) {
            schema.description = node.arguments[1].value;
          }
          break;

        case "transform":
          console.log('🔄 Processing transform');
          schema = { ...this.processZodType(node.arguments?.[0]) };
          schema["x-transform"] = node.arguments?.[1]?.toString();
          break;

        case "refine":
          console.log('🔍 Processing refinement');
          schema = { ...this.processZodType(node.arguments?.[0]) };
          schema["x-refinement"] = node.arguments?.[1]?.toString();
          break;

        case "union":
          console.log('🔗 Processing union type');
          schema = {
            anyOf: node.arguments?.[0]?.elements?.map((element: any) => 
              this.processZodType(element)
            ) || []
          };
          break;

        case "intersection":
          console.log('🔗 Processing intersection type');
          schema = {
            allOf: node.arguments?.[0]?.elements?.map((element: any) => 
              this.processZodType(element)
            ) || []
          };
          break;

        case "literal":
          console.log('📌 Processing literal type:', node.arguments?.[0]?.value);
          schema = {
            enum: [node.arguments?.[0]?.value]
          };
          break;

        case "enum":
          console.log('📋 Processing enum type');
          schema = {
            type: "string",
            enum: node.arguments?.[0]?.elements?.map((element: any) => 
              element.value
            ) || []
          };
          break;

        case "object":
          console.log('🏗️ Processing object type');
          schema = this.processZodObject(node.arguments?.[0]);
          // Handle recursive object references
          if (node.arguments?.[0]?.properties) {
            console.log('🔍 Checking for nested schema references');
            node.arguments[0].properties.forEach((property: any) => {
              if (property.value?.callee?.name?.endsWith('Schema')) {
                const refSchemaName = property.value.callee.name;
                console.log('📚 Found nested schema reference:', refSchemaName);
                this.getSchemaReference(refSchemaName);
              }
            });
          }
          break;

        // New Zod features
        case "coerce":
          schema = { ...this.processZodType(node.arguments?.[0]) };
          schema["x-coerce"] = true;
          break;

        case "date":
          schema = { type: "string", format: "date-time" };
          if (node.arguments?.[0]) {
            const validation = node.arguments[0];
            if (validation.min) schema.minimum = validation.min.toISOString();
            if (validation.max) schema.maximum = validation.max.toISOString();
          }
          break;

        case "record":
          schema = {
            type: "object",
            additionalProperties: this.processZodType(node.arguments?.[1])
          };
          break;

        case "tuple":
          schema = {
            type: "array",
            items: {
              anyOf: node.arguments?.[0]?.elements?.map((element: any) => 
                this.processZodType(element)
              ) || []
            },
            minItems: node.arguments?.[0]?.elements?.length,
            maxItems: node.arguments?.[0]?.elements?.length
          };
          break;

        case "catchall":
          schema = {
            type: "object",
            additionalProperties: this.processZodType(node.arguments?.[0])
          };
          break;

        case "brand":
          schema = { ...this.processZodType(node.arguments?.[0]) };
          schema["x-brand"] = node.arguments?.[1]?.name;
          break;

        case "pipe":
          schema = { ...this.processZodType(node.arguments?.[0]) };
          schema["x-pipeline"] = node.arguments?.[1]?.toString();
          break;

        case "preprocess":
          schema = { ...this.processZodType(node.arguments?.[1]) };
          schema["x-preprocess"] = node.arguments?.[0]?.toString();
          break;

        case "discriminatedUnion":
          const discriminator = node.arguments?.[0];
          const options = node.arguments?.[1]?.elements || [];
          schema = {
            oneOf: options.map((option: any) => this.processZodType(option)),
            discriminator: {
              propertyName: discriminator
            }
          };
          break;

        case "lazy":
          schema = {
            type: "object",
            "x-lazy": true,
            "x-lazy-schema": node.arguments?.[0]?.toString()
          };
          break;

        case "nativeEnum":
          const enumObj = node.arguments?.[0];
          schema = {
            type: "string",
            enum: Object.values(enumObj)
          };
          break;

        // Additional validation methods
        case "regex":
          schema = { ...this.processZodType(node.arguments?.[0]) };
          if (node.arguments?.[1]) {
            schema.pattern = node.arguments[1].value;
          }
          break;

        case "url":
          schema = { type: "string", format: "uri" };
          break;

        case "uuid":
          schema = { type: "string", format: "uuid" };
          break;

        case "email":
          schema = { type: "string", format: "email" };
          break;

        case "nonempty":
          schema = { ...this.processZodType(node.arguments?.[0]) };
          if (schema.type === "array") {
            schema.minItems = 1;
          } else if (schema.type === "string") {
            schema.minLength = 1;
          }
          break;

        case "length":
          schema = { ...this.processZodType(node.arguments?.[0]) };
          if (schema.type === "array") {
            schema.minItems = node.arguments[1].value;
            schema.maxItems = node.arguments[1].value;
          } else if (schema.type === "string") {
            schema.minLength = node.arguments[1].value;
            schema.maxLength = node.arguments[1].value;
          }
          break;

        case "strict":
          schema = { ...this.processZodType(node.arguments?.[0]) };
          schema["x-strict"] = true;
          break;

        case "passthrough":
          schema = { ...this.processZodType(node.arguments?.[0]) };
          schema["x-passthrough"] = true;
          break;

        case "strip":
          schema = { ...this.processZodType(node.arguments?.[0]) };
          schema["x-strip"] = true;
          break;

        case "deprecated":
          schema = { ...this.processZodType(node.arguments?.[0]) };
          schema.deprecated = true;
          break;

        case "example":
          schema = { ...this.processZodType(node.arguments?.[0]) };
          if (node.arguments?.[1]) {
            schema.example = node.arguments[1].value;
          }
          break;
      }

      // Add custom error messages if present
      if (node.arguments?.[1]?.value) {
        console.log('⚠️ Adding custom error message:', node.arguments[1].value);
        schema["x-error-message"] = node.arguments[1].value;
      }

      // Add metadata if present
      if (node.metadata) {
        console.log('📋 Adding metadata:', node.metadata);
        Object.entries(node.metadata).forEach(([key, value]) => {
          schema[`x-${key}`] = value;
        });
      }

      console.log('✨ Final processed schema:', schema);
      return schema;
    }

    // Handle direct schema references (like in array items)
    if (node.name?.endsWith('Schema')) {
      const schemaName = node.name;
      console.log('📚 Found direct schema reference:', schemaName);
      const referencedSchema = this.getSchemaReference(schemaName);
      if (referencedSchema) {
        console.log('✅ Using referenced schema:', referencedSchema);
        return referencedSchema;
      }
    }

    console.log('⚠️ No matching Zod type found');
    return {};
  }

  private processZodObject(node: any): OpenAPISchema {
    console.log('🏗️ Processing Zod object:', {
      hasProperties: !!node?.properties,
      propertyCount: node?.properties?.length
    });

    if (!node?.properties) {
      console.log('⚠️ Empty object node');
      return { type: "object", properties: {} };
    }

    const properties: Record<string, OpenAPISchema> = {};
    const required: string[] = [];

    node.properties.forEach((property: any) => {
      const fieldName = property.key.name;
      const zodType = property.value;
      
      console.log('🔍 Processing property:', fieldName);
      
      // Process the Zod type
      let schema = this.processZodType(zodType);
      
      // Handle schema references
      if (zodType?.callee?.name?.endsWith('Schema')) {
        const refSchemaName = zodType.callee.name;
        console.log('📚 Found schema reference in property:', refSchemaName);
        this.getSchemaReference(refSchemaName);
      }
      
      // Handle optional/required
      if (!zodType.optional) {
        console.log('📌 Adding to required fields:', fieldName);
        required.push(fieldName);
      }
      
      // Handle default values
      if (zodType.default) {
        console.log('💫 Adding default value for:', fieldName);
        schema.default = zodType.default;
      }
      
      // Handle descriptions
      if (zodType.description) {
        console.log('📄 Adding description for:', fieldName);
        schema.description = zodType.description;
      }

      // Handle deprecated
      if (zodType.deprecated) {
        console.log('⚠️ Marking as deprecated:', fieldName);
        schema.deprecated = true;
      }

      // Handle examples
      if (zodType.example) {
        console.log('💡 Adding example for:', fieldName);
        schema.example = zodType.example;
      }
      
      properties[fieldName] = schema;
    });

    const result = {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined
    };

    console.log('✨ Final processed object:', result);
    return result;
  }

  private isObjectType(node) {
      return node?.type === 'object';
  }

  private resolveType(typeName: string) {
    const typeNode = this.typeDefinitions[typeName.toString()];
    if (!typeNode) return {};

    if (t.isTSEnumDeclaration(typeNode)) {
      const enumValues = this.processEnum(typeNode);
      return enumValues;
    }

    if (t.isTSTypeLiteral(typeNode) || t.isTSInterfaceBody(typeNode)) {
      const properties = {};

      if ("members" in typeNode) {
        (typeNode.members || []).forEach((member) => {
          if (t.isTSPropertySignature(member) && t.isIdentifier(member.key)) {
            const propName = member.key.name;
            const options = this.getPropertyOptions(member);

            const property = {
              ...this.resolveTSNodeType(member.typeAnnotation?.typeAnnotation),
              ...options,
            };

            properties[propName] = property;
          }
        });
      }

      return { type: "object", properties };
    }

    if (t.isTSArrayType(typeNode)) {
      return {
        type: "array",
        items: this.resolveTSNodeType(typeNode.elementType),
      };
    }
    if (this.isObjectType(typeNode)) {
        return typeNode;
    }

    return {};
  }

  resolveTSNodeType(node) {
    if (t.isTSStringKeyword(node)) return { type: "string" };
    if (t.isTSNumberKeyword(node)) return { type: "number" };
    if (t.isTSBooleanKeyword(node)) return { type: "boolean" };

    if (t.isTSTypeReference(node) && t.isIdentifier(node.typeName)) {
      const typeName = node.typeName.name;
      // Find type definition
      this.findSchemaDefinition(typeName, this.contentType);

      return this.resolveType(node.typeName.name);
    }

    if (t.isTSArrayType(node)) {
      return {
        type: "array",
        items: this.resolveTSNodeType(node.elementType),
      };
    }

    if (t.isTSTypeLiteral(node)) {
      const properties = {};
      node.members.forEach((member) => {
        if (t.isTSPropertySignature(member) && t.isIdentifier(member.key)) {
          const propName = member.key.name;
          properties[propName] = this.resolveTSNodeType(
            member.typeAnnotation?.typeAnnotation
          );
        }
      });
      return { type: "object", properties };
    }

    if (t.isTSUnionType(node)) {
      return {
        anyOf: node.types.map((subNode) => this.resolveTSNodeType(subNode)),
      };
    }

    // case where a type is a reference to another defined type
    if (t.isTSTypeReference(node) && t.isIdentifier(node.typeName)) {
      return { $ref: `#/components/schemas/${node.typeName.name}` };
    }

    console.warn("Unrecognized TypeScript type node:", node);

    return {};
  }

  private processEnum(enumNode: t.TSEnumDeclaration): object {
    // Initialization OpenAPI enum object
    const enumSchema = {
      type: "string",
      enum: [],
    };

    // Iterate throught enum members
    enumNode.members.forEach((member) => {
      if (t.isTSEnumMember(member)) {
        // @ts-ignore
        const name = member.id?.name;
        // @ts-ignore
        const value = member.initializer?.value;
        let type = member.initializer?.type;

        if (type === "NumericLiteral") {
          enumSchema.type = "number";
        }

        const targetValue = value || name;

        enumSchema.enum.push(targetValue);
      }
    });

    return enumSchema;
  }

  private getPropertyOptions(node) {
    const key = node.key.name;
    const isOptional = !!node.optional; // check if property is optional
    const typeName = node.typeAnnotation?.typeAnnotation?.typeName?.name;

    let description = null;
    // get comments for field
    if (node.trailingComments && node.trailingComments.length) {
      description = node.trailingComments[0].value.trim(); // get first comment
    }

    const options: Property = {};

    if (description) {
      options.description = description;
    }

    if (this.contentType === "params") {
      options.required = !isOptional;
    } else if (this.contentType === "body") {
      options.nullable = isOptional;
    }

    return options;
  }

  public getSchemaContent({ paramsType, bodyType, responseType }) {
    console.log('🔍 Getting schema content for:', { paramsType, bodyType, responseType });
    
    // Process all schemas first
    if (paramsType) {
      const paramsSchemaName = paramsType.endsWith('Schema') ? paramsType : `${paramsType}Schema`;
      this.findSchemaDefinition(paramsSchemaName, "params");
    }
    if (bodyType) {
      const bodySchemaName = bodyType.endsWith('Schema') ? bodyType : `${bodyType}Schema`;
      this.findSchemaDefinition(bodySchemaName, "body");
    }
    if (responseType) {
      const responseSchemaName = responseType.endsWith('Schema') ? responseType : `${responseType}Schema`;
      this.findSchemaDefinition(responseSchemaName, "response");
    }

    // Get the processed schemas
    const params = paramsType ? this.openapiDefinitions[`${paramsType}Schema`] : undefined;
    const body = bodyType ? this.openapiDefinitions[`${bodyType}Schema`] : undefined;
    const responses = responseType ? this.openapiDefinitions[`${responseType}Schema`] : undefined;

    console.log('📄 Retrieved schemas:', {
      params,
      body,
      responses
    });

    // Create the request body schema
    const requestBody = body ? {
      content: {
        "application/json": {
          schema: body
        }
      }
    } : undefined;

    // Create the response schema
    const responseSchema = responses ? {
      200: {
        description: "Successful response",
        content: {
          "application/json": {
            schema: responses
          }
        }
      }
    } : {};

    // Create the parameters schema
    const parameters = params ? this.createRequestParamsSchema(params) : { properties: {} };

    console.log('✨ Final schema content:', {
      requestBody,
      responseSchema,
      parameters
    });

    return {
      requestBody,
      responses: responseSchema,
      params: parameters
    };
  }

  public createRequestParamsSchema(params: OpenAPISchema): Params {
    console.log('🔧 Creating request params schema from:', params);
    const queryParams: Property[] = [];

    if (params.properties) {
      for (let [name, value] of Object.entries(params.properties)) {
        console.log('📝 Processing param:', name, value);
        const param: Property = {
          in: "query",
          name,
          schema: {
            type: value.type,
            ...value
          },
          required: Array.isArray(value.required) ? value.required.includes(name) : value.required === true,
        };

        if (value.enum) {
          param.schema.enum = value.enum;
        }

        if (value.description) {
          param.description = value.description;
          param.schema.description = value.description;
        }

        queryParams.push(param);
      }
    }

    const result = {
      properties: queryParams.reduce((acc, param) => {
        acc[param.name] = param;
        return acc;
      }, {} as Record<string, Property>)
    };

    console.log('✨ Created params schema:', result);
    return result;
  }

  public createRequestBodySchema(body: OpenAPISchema) {
    console.log('🔧 Creating request body schema from:', body);
    const result = {
      content: {
        "application/json": {
          schema: body
        }
      }
    };
    console.log('✨ Created body schema:', result);
    return result;
  }

  public createResponseSchema(responses: OpenAPISchema) {
    console.log('🔧 Creating response schema from:', responses);
    const result = {
      200: {
        description: "Successful response",
        content: {
          "application/json": {
            schema: responses
          }
        }
      }
    };
    console.log('✨ Created response schema:', result);
    return result;
  }

  private getSchemaReference(schemaName: string): OpenAPISchema | undefined {
    console.log('🔍 Getting schema reference:', schemaName);
    
    // Ensure schema name has Schema suffix
    const schemaNameWithSuffix = schemaName.endsWith('Schema') ? schemaName : `${schemaName}Schema`;
    
    // Try to find schema with Schema suffix
    if (this.processedSchemas.has(schemaNameWithSuffix)) {
      console.log('✅ Found schema reference:', schemaNameWithSuffix);
      const schema = this.openapiDefinitions[schemaNameWithSuffix];
      console.log('📄 Schema content:', schema);
      if (!schema || Object.keys(schema).length === 0) {
        console.log('⚠️ Found empty schema, attempting to reprocess');
        // Clear the existing empty schema
        delete this.openapiDefinitions[schemaNameWithSuffix];
        this.processedSchemas.delete(schemaNameWithSuffix);
        // Reprocess the schema
        this.findSchemaDefinition(schemaNameWithSuffix, this.contentType);
        const reprocessedSchema = this.openapiDefinitions[schemaNameWithSuffix];
        console.log('📄 Reprocessed schema content:', reprocessedSchema);
        return reprocessedSchema;
      }
      return schema;
    }
    
    // If we haven't processed this schema yet, process it
    console.log('🔄 Schema not yet processed, processing now:', schemaNameWithSuffix);
    this.findSchemaDefinition(schemaNameWithSuffix, this.contentType);
    
    // Try again after processing
    if (this.processedSchemas.has(schemaNameWithSuffix)) {
      console.log('✅ Found schema reference after processing:', schemaNameWithSuffix);
      const schema = this.openapiDefinitions[schemaNameWithSuffix];
      console.log('📄 Schema content:', schema);
      if (!schema || Object.keys(schema).length === 0) {
        console.log('⚠️ Found empty schema after processing');
        return undefined;
      }
      return schema;
    }

    console.log('❌ Schema reference not found:', schemaNameWithSuffix);
    return undefined;
  }
}
