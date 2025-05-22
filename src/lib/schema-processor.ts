import fs from "fs";
import path from "path";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";

import { Params, Property } from "../types";

interface OpenAPISchema {
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
  required?: string[];
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

export class SchemaProcessor {
  private schemaDir: string;
  private typeDefinitions: any = {};
  private openapiDefinitions: any = {};
  private contentType: string = "";

  constructor(schemaDir: string) {
    this.schemaDir = path.resolve(schemaDir);
  }

  public findSchemaDefinition(schemaName: string, contentType: string) {
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

  private processZodType(node: any): OpenAPISchema {
    if (!node) return {};

    // Handle schema references first
    if (node.callee?.name && node.callee.name.endsWith('Schema')) {
      const schemaName = node.callee.name;
      // Find and process the referenced schema
      this.findSchemaDefinition(schemaName, this.contentType);
      const referencedSchema = this.openapiDefinitions[schemaName];
      if (referencedSchema) {
        return referencedSchema;
      }
    }

    // Handle basic types
    if (node.callee?.property?.name) {
      const typeName = node.callee.property.name;
      let schema: OpenAPISchema = {};

      switch (typeName) {
        case "string":
          schema = { type: "string" };
          if (node.arguments?.[0]) {
            const validation = node.arguments[0];
            if (validation.min) schema.minLength = validation.min;
            if (validation.max) schema.maxLength = validation.max;
            if (validation.pattern) schema.pattern = validation.pattern;
          }
          break;

        case "number":
          schema = { type: "number" };
          if (node.arguments?.[0]) {
            const validation = node.arguments[0];
            if (validation.min) schema.minimum = validation.min;
            if (validation.max) schema.maximum = validation.max;
          }
          break;

        case "boolean":
          schema = { type: "boolean" };
          break;

        case "array":
          schema = {
            type: "array",
            items: this.processZodType(node.arguments?.[0])
          };
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
          schema = { ...this.processZodType(node.arguments?.[0]), nullable: true };
          break;

        case "optional":
          schema = { ...this.processZodType(node.arguments?.[0]) };
          break;

        case "default":
          schema = { ...this.processZodType(node.arguments?.[0]) };
          if (node.arguments?.[1]) {
            schema.default = node.arguments[1].value;
          }
          break;

        case "describe":
          schema = { ...this.processZodType(node.arguments?.[0]) };
          if (node.arguments?.[1]) {
            schema.description = node.arguments[1].value;
          }
          break;

        case "transform":
          schema = { ...this.processZodType(node.arguments?.[0]) };
          schema["x-transform"] = node.arguments?.[1]?.toString();
          break;

        case "refine":
          schema = { ...this.processZodType(node.arguments?.[0]) };
          schema["x-refinement"] = node.arguments?.[1]?.toString();
          break;

        case "union":
          schema = {
            anyOf: node.arguments?.[0]?.elements?.map((element: any) => 
              this.processZodType(element)
            ) || []
          };
          break;

        case "intersection":
          schema = {
            allOf: node.arguments?.[0]?.elements?.map((element: any) => 
              this.processZodType(element)
            ) || []
          };
          break;

        case "literal":
          schema = {
            enum: [node.arguments?.[0]?.value]
          };
          break;

        case "enum":
          schema = {
            type: "string",
            enum: node.arguments?.[0]?.elements?.map((element: any) => 
              element.value
            ) || []
          };
          break;

        case "object":
          schema = this.processZodObject(node.arguments?.[0]);
          // Handle recursive object references
          if (node.arguments?.[0]?.properties) {
            node.arguments[0].properties.forEach((property: any) => {
              if (property.value?.callee?.name?.endsWith('Schema')) {
                const refSchemaName = property.value.callee.name;
                this.findSchemaDefinition(refSchemaName, this.contentType);
                const refSchema = this.openapiDefinitions[refSchemaName];
                if (refSchema) {
                  schema.properties[property.key.name] = refSchema;
                }
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
        schema["x-error-message"] = node.arguments[1].value;
      }

      // Add metadata if present
      if (node.metadata) {
        Object.entries(node.metadata).forEach(([key, value]) => {
          schema[`x-${key}`] = value;
        });
      }

      return schema;
    }

    return {};
  }

  private processZodObject(node: any): OpenAPISchema {
    if (!node?.properties) return { type: "object", properties: {} };

    const properties: Record<string, OpenAPISchema> = {};
    const required: string[] = [];

    node.properties.forEach((property: any) => {
      const fieldName = property.key.name;
      const zodType = property.value;
      
      // Process the Zod type
      let schema = this.processZodType(zodType);
      
      // Handle schema references
      if (zodType?.callee?.name?.endsWith('Schema')) {
        const refSchemaName = zodType.callee.name;
        this.findSchemaDefinition(refSchemaName, this.contentType);
        const refSchema = this.openapiDefinitions[refSchemaName];
        if (refSchema) {
          schema = refSchema;
        }
      }
      
      // Handle optional/required
      if (!zodType.optional) {
        required.push(fieldName);
      }
      
      // Handle default values
      if (zodType.default) {
        schema.default = zodType.default;
      }
      
      // Handle descriptions
      if (zodType.description) {
        schema.description = zodType.description;
      }

      // Handle deprecated
      if (zodType.deprecated) {
        schema.deprecated = true;
      }

      // Handle examples
      if (zodType.example) {
        schema.example = zodType.example;
      }
      
      properties[fieldName] = schema;
    });

    return {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined
    };
  }

  private collectTypeDefinitions(ast: any, schemaName: string) {
    if (!!this.typeDefinitions[schemaName]) return;
    
    traverse.default(ast, {
      VariableDeclarator: (path) => {
        if (t.isIdentifier(path.node.id, { name: schemaName })) {
          const name = path.node.id.name;
          this.typeDefinitions[name] = path.node.init || path.node;
        }
        if (path.node.id.name === `${schemaName}Schema`) {
          this.typeDefinitions[schemaName] = this.processZodType(path.node.init);
        }
      },
      TSTypeAliasDeclaration: (path) => {
        if (t.isIdentifier(path.node.id, { name: schemaName }) && path.node.typeAnnotation?.typeName?.right?.name !== 'infer') {
          const name = path.node.id.name;
          this.typeDefinitions[name] = path.node.typeAnnotation;
        }
      },
      TSInterfaceDeclaration: (path) => {
        if (t.isIdentifier(path.node.id, { name: schemaName })) {
          const name = path.node.id.name;
          this.typeDefinitions[name] = path.node;
        }
      },
      TSEnumDeclaration: (path) => {
        if (t.isIdentifier(path.node.id, { name: schemaName })) {
          const name = path.node.id.name;
          this.typeDefinitions[name] = path.node;
        }
      },
    });
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

  private processSchemaFile(filePath: string, schemaName: string) {
    // Recognizes different elements of TS like variable, type, interface, enum
    if (filePath.endsWith(`${schemaName}.ts`)) {
      const content = fs.readFileSync(filePath, "utf-8");
      const ast = parse(content, {
        sourceType: "module",
        plugins: ["typescript", "decorators-legacy"],
      });

      this.collectTypeDefinitions(ast, schemaName);

      const definition = this.resolveType(schemaName);
      this.openapiDefinitions[schemaName] = definition;

      return definition;
    }
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

  public createRequestParamsSchema(params: Params) {
    const queryParams = [];

    if (params.properties) {
      for (let [name, value] of Object.entries(params.properties)) {
        const param: Property = {
          in: "query",
          name,
          schema: {
            type: value.type,
          },
          required: value.required,
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
    return queryParams;
  }

  public createRequestBodySchema(body: Record<string, any>) {
    return {
      content: {
        "application/json": {
          schema: body,
        },
      },
    };
  }

  public createResponseSchema(responses: Record<string, any>) {
    return {
      200: {
        description: "Successful response",
        content: {
          "application/json": {
            schema: responses,
          },
        },
      },
    };
  }

  public getSchemaContent({ paramsType, bodyType, responseType }) {
    this.findSchemaDefinition(paramsType, "params");
    this.findSchemaDefinition(bodyType, "body");
    this.findSchemaDefinition(responseType, "response");

    const params = this.openapiDefinitions[paramsType];
    const body = this.openapiDefinitions[bodyType];
    const responses = this.openapiDefinitions[responseType];

    return {
      params,
      body,
      responses,
    };
  }
}
