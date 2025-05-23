# next-openapi-gen

**next-openapi-gen** super fast and easy way to generate OpenAPI 3.0 documentation automatically from API routes in NextJS.

## Prerequisites

- Next.js >= 14
- Node >= 18

## Interfaces

- Swagger
- Redoc
- Stoplight Elements
- RapiDoc

## Features

- **Automatic OpenAPI Generation**: Generate OpenAPI 3.0 documentation from your Next.js routes, automatically parsing TypeScript types for parameters, request bodies and responses. Field comments in TypeScript types are reflected as descriptions in the OpenAPI schema.
- **Complex TypeScript Types**: Use complex TypeScript types, such as `nested objects`, `arrays`, `enums` and `unions` (mapped to anyOf). This enables a more comprehensive representation of data structures directly in the OpenAPI schema.
- **JSDoc-Based Documentation**: Document API routes with optional JSDoc comments, including tags like `@openapi`, `@auth`, `@desc`, `@params`, `@body`, and `@response` to easily define route metadata.
- **Multiple UI Interfaces**: Choose between `Swagger UI`, `Redoc`, `Stoplight Elements` or `RapiDoc` to visualize your API documentation. Customize the interface to fit your preferences.
- **Real-time Documentation**: As your API evolves, regenerate the OpenAPI documentation with a single command, ensuring your documentation is always up to date.
- **Easy configuration**: Customize generator behavior using the `next.openapi.json` configuration file, allowing for quick adjustments without modifying the code.

## Installation

```bash
yarn add next-openapi-gen
```

## Usage

### Step 1: Initialize Configuration and Setup

Run the following command to generate the `next.openapi.json` configuration file and automatically set up Swagger UI with `/api-docs` routes:

```bash
npx next-openapi-gen init --ui swagger --docs-url api-docs
```

Parameters:
- **ui**: `swagger` | `redoc` | `stoplight` | `rapidoc`
- **docs-url**: url on which api docs will be visible

This command does the following:

- Generates a `next.openapi.json` file, which stores the OpenAPI configuration for your project.
- Installs Swagger UI to provide an API documentation interface.
- Adds an `/api-docs` route in the Next.js app for visualizing the generated OpenAPI documentation.

### Step 2: Add JSDoc Comments to Your API Routes

Annotate your API routes using JSDoc comments. Here's an example:

<div align="center">
  <table>
    <tr>
      <th>Login route</th>
      <th>Swagger</th>
    </tr>
    <tr>
      <td>

  ```typescript
  //app/api/auth/login/route.ts

  type LoginBody = {
    email: string; // user email
    password: string; // user password
  };

  type LoginResponse = {
    token: string; // auth token
    refresh_token: string; // refresh token
  };

  /**
   * Authenticate as a user.
   * @desc: Login a user
   * @body: LoginBody
   * @response: LoginResponse
   */
  export async function POST(req: Request) {
    ...
  }
  ```
  </td>
  <td>
    <img width="340" alt="api-login" src="https://raw.githubusercontent.com/tazo90/next-openapi-gen/refs/heads/main/assets/api-login.png" alt-text="api-login"/>
  </td>
  </tr>

  <tr>
      <th>Users route</th>
      <th>Swagger</th>
    </tr>
  <tr>
      <td>

  ```typescript
  //app/api/users/route.ts

  enum ROLE {
    OWNER,
    MEMBER,
  }

  type User = {
    id: number;
    name: string;
    email: string;
    role: ROLE;
    address: Address;
  };

  type Address = {
    line1: string;
    line2?: string;
    city: string;
    postalCode: string;
  };

  type UsersParams = {
    search: string; // search by
    role?: ROLE; // filter by role
    page?: number; // page number
  };

  type UsersResponse = {
    page?: number;
    count?: number;
    data: User[];
  };

  /**
   * List all users.
   * @auth: bearer
   * @params: UsersParams
   * @response: UsersResponse
   */
  export async function GET(req: Request) {
    ...
  }
  ```
  </td>
  <td>
    <img width="340" alt="api-users" src="https://raw.githubusercontent.com/tazo90/next-openapi-gen/refs/heads/main/assets/api-users.png" alt-text="api-users"/>
  </td>
  </tr>
</table>
</div>

### Step 3: Generate the OpenAPI Specification

Run the following command to generate the OpenAPI schema based on your API routes:

```bash
npx next-openapi-gen generate
```

This command processes all your API routes, extracts the necessary information from JSDoc comments, and generates the OpenAPI schema, typically saved to a `swagger.json` file in the `public` folder.

### Step 4: View API Documentation

With the `/api-docs` route generated from the init command, you can now access your API documentation through Swagger UI by navigating to `http://localhost:3000/api-docs`.

## JSDoc tags

- `@openapi`: Marks the route for inclusion in the OpenAPI specification.
- `@auth`: Specifies authentication type used for API route (`basic`, `bearer`, `apikey`).
- `@desc`: Provides a detailed description of the API route.
- `@params`: Specifies the TypeScript interface for the query parameters.
- `@body`: Specifies the TypeScript interface for the request body.
- `@response`: Specifies the TypeScript interface for the response.

## Configuration Options

The `next.openapi.json` file allows you to configure the behavior of the OpenAPI generator, including options such as:

- **apiDir**: (default: `./src/app/api`) The directory where your API routes are stored.
- **schemaDir**: (default: `./src`) The directory where your schema definitions are stored.
- **docsUrl**: (default: `./api-docs`) Route where OpenAPI UI is available.
- **ui**: (default: `swagger`) OpenAPI UI interface.
- **outputFile**: (default: `./swagger.json`) The file where the generated OpenAPI specification will be saved in `public` folder.
- **includeOpenApiRoutes**: (default: `false`) When `true`, the generator will only include routes that have the `@openapi` tag in their JSDoc comments.

## Interface providers

<div align="center">
<table>
  <thead>
   <th>SwaggerUI</th>
   <th>Redoc</th>
   <th>Stoplight Elements</th>
   <th>RapiDoc</th>
  </thead>
  <tbody>
   <tr>
    <td>
	<img width="320" alt="swagger" src="https://raw.githubusercontent.com/tazo90/next-openapi-gen/refs/heads/main/assets/swagger.png" alt-text="swagger">
	</td>
	<td>
	<img width="320" alt="redoc" src="https://raw.githubusercontent.com/tazo90/next-openapi-gen/refs/heads/main/assets/redoc.png" alt-text="redoc">
	</td>
	<td>
	<img width="320" alt="stoplight" src="https://raw.githubusercontent.com/tazo90/next-openapi-gen/refs/heads/main/assets/stoplight.png" alt-text="stoplight">
	</td>
	<td>
	<img width="320" alt="rapidoc" src="https://raw.githubusercontent.com/tazo90/next-openapi-gen/refs/heads/main/assets/rapidoc.png" alt-text="rapidoc">
	</td>
   </tr>
  </tbody>
</table>

## Zod Schema Requirements

To ensure proper OpenAPI generation, your Zod schemas must follow these conventions:

1. **Schema Naming**:
   - All schema definitions must end with the `Schema` suffix
   - Example: `PeerParamsSchema`, `UserResponseSchema`

2. **Schema Structure**:
   ```typescript
   // ✅ Correct
   export const UserSchema = z.object({
     id: z.string(),
     name: z.string(),
     email: z.string().email()
   });

   // ❌ Incorrect
   export const User = z.object({...}); // Missing Schema suffix
   ```

3. **Type References**:
   - When referencing other schemas, use the full schema name
   - Example: `z.array(PeerParamsSchema)` instead of `z.array(PeerParams)`

4. **Nullable Fields**:
   - Use `z.nullable()` for optional fields
   - Example: `z.nullable(z.string())`

5. **Array Types**:
   - For array responses, define the schema as an array of the item type
   - Example: `export const UserListSchema = z.array(UserSchema)`

6. **Common Patterns**:
   ```typescript
   // Query Parameters Schema
   export const QueryParamsSchema = z.object({
     page: z.nullable(z.number()),
     limit: z.nullable(z.number())
   });

   // Request Body Schema
   export const CreateUserSchema = z.object({
     name: z.string(),
     email: z.string().email()
   });

   // Response Schema
   export const UserResponseSchema = z.object({
     id: z.string(),
     name: z.string(),
     email: z.string().email()
   });

   // Array Response Schema
   export const UserListResponseSchema = z.array(UserResponseSchema);
   ```

7. **Supported Zod Types**:
   - Basic types: `string`, `number`, `boolean`
   - Complex types: `object`, `array`, `enum`
   - Validation: `email`, `url`, `uuid`
   - Modifiers: `nullable`, `optional`, `default`

8. **Best Practices**:
   - Keep schemas in separate files under the `schemaDir`
   - Use descriptive names that indicate the purpose (Params, Request, Response)
   - Include the `Schema` suffix in all schema definitions
   - Use `z.nullable()` for optional fields instead of `z.optional()`
   - Define array responses using `z.array()`

## Example

```typescript
// src/types/user.ts
import { z } from 'zod';

export const UserParamsSchema = z.object({
  id: z.nullable(z.string()),
  includeDetails: z.nullable(z.boolean())
});

export const CreateUserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  role: z.enum(['admin', 'user'])
});

export const UserResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(['admin', 'user']),
  createdAt: z.string().datetime()
});

export const UserListResponseSchema = z.array(UserResponseSchema);
```

## License

MIT
