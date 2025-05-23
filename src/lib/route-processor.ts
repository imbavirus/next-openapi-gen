import * as t from "@babel/types";
import fs from "fs";
import path from "path";
import traverse from "@babel/traverse";
import { parse } from "@babel/parser";

import { SchemaProcessor } from "./schema-processor.js";
import { capitalize, extractJSDocComments, getOperationId } from "./utils.js";
import { DataTypes, OpenApiConfig } from "../types";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const MUTATION_HTTP_METHODS = ["PATCH", "POST", "PUT"];

/**
 * Processes Next.js API routes to generate OpenAPI specifications
 * Handles route definitions, extracts metadata, and generates path items
 */
export class RouteProcessor {
  private swaggerPaths: Record<string, any> = {};
  private schemaProcessor: SchemaProcessor;
  private config: OpenApiConfig;
  private paths: Record<string, any> = {};

  /**
   * Creates a new RouteProcessor instance
   * @param config - Configuration object for the route processor
   */
  constructor(config: OpenApiConfig) {
    this.config = config;
    this.schemaProcessor = new SchemaProcessor(config.schemaDir);
  }

  /**
   * Checks if a variable name represents an HTTP method
   * @param varName - Variable name to check
   * @returns True if the variable name is an HTTP method
   */
  private isRoute(varName: string) {
    return HTTP_METHODS.includes(varName);
  }

  /**
   * Processes a single file to extract route definitions
   * @param filePath - Path to the file to process
   */
  private processFile(filePath: string) {
    const content = fs.readFileSync(filePath, "utf-8");
    const ast = parse(content, {
      sourceType: "module",
      plugins: ["typescript", "decorators-legacy"],
    });

    traverse.default(ast, {
      ExportNamedDeclaration: (path) => {
        const declaration = path.node.declaration;

        if (
          t.isFunctionDeclaration(declaration) &&
          t.isIdentifier(declaration.id)
        ) {
          const dataTypes = extractJSDocComments(path);
          if (this.isRoute(declaration.id.name)) {
            this.addRouteToPaths(declaration.id.name, filePath, dataTypes);
          }
        }

        if (t.isVariableDeclaration(declaration)) {
          declaration.declarations.forEach((decl) => {
            if (t.isVariableDeclarator(decl) && t.isIdentifier(decl.id)) {
              if (this.isRoute(decl.id.name)) {
                this.addRouteToPaths(
                  decl.id.name,
                  filePath,
                  extractJSDocComments(path)
                );
              }
            }
          });
        }
      },
    });
  }

  /**
   * Recursively scans a directory for API routes
   * @param dir - Directory to scan
   */
  public scanApiRoutes(dir: string) {
    const files = fs.readdirSync(dir);

    files.forEach((file) => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        this.scanApiRoutes(filePath);
      } else if (file.endsWith(".ts")) {
        this.processFile(filePath);
      }
    });
  }

  /**
   * Adds a route to the paths collection
   * @param varName - Variable name of the route
   * @param filePath - Path to the file containing the route
   * @param dataTypes - Data types extracted from JSDoc comments
   */
  private addRouteToPaths(
    varName: string,
    filePath: string,
    dataTypes: DataTypes
  ): void {
    const method = varName.toLowerCase();
    const routePath = this.getRoutePath(filePath);
    const rootPath = capitalize(routePath.split("/")[1]);
    const operationId = getOperationId(routePath, method);
    const { summary, description, auth, isOpenApi, paramsType, bodyType, responseType } = dataTypes;

    if (this.config.includeOpenApiRoutes && !isOpenApi) {
      // If flag is enabled and there is no @openapi tag, then skip path
      return;
    }

    if (!this.swaggerPaths[routePath]) {
      this.swaggerPaths[routePath] = {};
    }

    // Get schema content
    const schemaContent = this.schemaProcessor.getSchemaContent({
      paramsType,
      bodyType,
      responseType,
    });

    // Parameters
    let parameters: any[] = [];
    if (schemaContent.params && schemaContent.params.properties) {
      parameters = Object.values(schemaContent.params.properties);
    }

    // Build the operation definition
    const definition: any = {
      operationId: operationId,
      summary: summary || `${method.toUpperCase()} ${routePath}`,
      description: description || `Endpoint for ${method.toUpperCase()} ${routePath}`,
      tags: [rootPath],
      parameters,
      requestBody: schemaContent.requestBody,
      responses: schemaContent.responses,
    };

    // Add auth
    if (auth) {
      definition.security = [
        {
          [auth]: [],
        },
      ];
    }

    this.swaggerPaths[routePath][method] = definition;
  }

  /**
   * Gets the route path from a file path
   * @param filePath - File path to extract route path from
   * @returns The route path
   */
  private getRoutePath(filePath: string): string {
    const suffixPath = filePath.split("api")[1];
    return suffixPath
      .replace("route.ts", "")
      .replaceAll("\\", "/")
      .replace(/\/$/, "");
  }

  /**
   * Sorts paths based on tags and path length
   * @param paths - Paths to sort
   * @returns Sorted paths
   */
  private getSortedPaths(paths: Record<string, any>) {
    function comparePaths(a, b) {
      const aMethods = this.swaggerPaths[a] || {};
      const bMethods = this.swaggerPaths[b] || {};

      // Extract tags for all methods in path a
      const aTags = Object.values(aMethods).flatMap(
        (method: any) => method.tags || []
      );
      // Extract tags for all methods in path b
      const bTags = Object.values(bMethods).flatMap(
        (method: any) => method.tags || []
      );

      // Let's user only the first tags
      const aPrimaryTag = aTags[0] || "";
      const bPrimaryTag = bTags[0] || "";

      // Sort alphabetically based on the first tag
      const tagComparison = aPrimaryTag.localeCompare(bPrimaryTag);
      if (tagComparison !== 0) {
        return tagComparison; // Return the result of tag comparison
      }

      // Compare lengths of the paths
      const aLength = a.split("/").length;
      const bLength = b.split("/").length;

      return aLength - bLength; // Shorter paths come before longer ones
    }

    return Object.keys(paths)
      .sort(comparePaths.bind(this))
      .reduce((sorted, key) => {
        sorted[key] = paths[key];
        return sorted;
      }, {});
  }

  /**
   * Gets the sorted Swagger paths
   * @returns Sorted Swagger paths
   */
  public getSwaggerPaths() {
    const paths = this.getSortedPaths(this.swaggerPaths);
    return this.getSortedPaths(paths);
  }
}
