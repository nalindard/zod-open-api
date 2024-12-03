import express from 'express'
import { z } from 'zod'
import {
    OpenAPIRegistry,
    extendZodWithOpenApi,
    OpenApiGeneratorV3 as OpenAPIGenerator,
} from '@asteasolutions/zod-to-openapi'
import swaggerUi from 'swagger-ui-express'

// Extend Zod with OpenAPI functionality
extendZodWithOpenApi(z)

// Initialize OpenAPI registry
const registry = new OpenAPIRegistry()

// Define schema once using Zod
const UserSchema = z.object({
    name: z
        .string({
            required_error: 'Name is required.',
            invalid_type_error: 'Name must be a string.',
        })
        .min(2, { message: 'Name must be at least 2 characters long.' }),
    email: z
        .string({
            required_error: 'Email is required.',
            invalid_type_error: 'Email must be a string.',
        })
        .email({
            message: 'Invalid email format. Please provide a valid email.',
        }),
    age: z
        .number({
            invalid_type_error: 'Age must be a number.',
        })
        .int({ message: 'Age must be an integer.' })
        .min(0, { message: 'Age must be a non-negative number.' })
        .optional(),
    roles: z
        .array(
            z.enum(['admin', 'user'], {
                errorMap: () => ({
                    message: "Role must be 'admin' or 'user'.",
                }),
            })
        )
        .default(['user'])
        .describe('User roles (admin or user)'),
})

// Register the schema with OpenAPI
registry.register('User', UserSchema)

// Create request DTOs using the same schema
const CreateUserDTO = UserSchema
const UpdateUserDTO = UserSchema.partial()
const GetUserQueryDTO = z.object({
    includeRoles: z
        .boolean({
            required_error: 'IncludeRoles is required.',
            invalid_type_error: 'IncludeRoles must be a boolean.',
        })
        .default(false)
        .refine((val) => typeof val === 'boolean', {
            message: 'IncludeRoles must be a boolean value.',
        }),
    page: z
        .number({
            invalid_type_error: 'Page must be a number.',
        })
        .int({ message: 'Page must be an integer.' })
        .min(1, { message: 'Page must be at least 1.' })
        .default(1),
    limit: z
        .number({
            invalid_type_error: 'Limit must be a number.',
        })
        .int({ message: 'Limit must be an integer.' })
        .min(1, { message: 'Limit must be at least 1.' })
        .max(100, { message: 'Limit cannot exceed 100.' })
        .default(10),
})

// Register paths with OpenAPI metadata
registry.registerPath({
    method: 'post',
    path: '/users',
    description: 'Create a new user',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: CreateUserDTO,
                },
            },
        },
    },
    responses: {
        201: {
            description: 'User created successfully',
            content: {
                'application/json': {
                    schema: UserSchema,
                },
            },
        },
        400: {
            description: 'Validation Error',
            content: {
                'application/json': {
                    schema: z.object({
                        error: z.string(),
                        details: z.array(
                            z.object({
                                code: z.string(),
                                message: z.string(),
                                path: z.array(z.string()),
                            })
                        ),
                    }),
                },
            },
        },
    },
})

// Express middleware for Zod validation
const validateRequest = (schema: z.ZodType) => {
    return async (
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
    ) => {
        try {
            req.body = await schema.parseAsync(req.body)
            next()
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({
                    error: 'Validation failed',
                    details: error.errors,
                })
            } else {
                next(error)
            }
        }
    }
}

// Create Express app
const app = express()
app.use(express.json())

// Example route with validation
app.post('/users', validateRequest(CreateUserDTO), (req, res) => {
    // req.body is now typed and validated
    const user = req.body
    res.status(201).json(user)
})

// Generate OpenAPI document
const generator = new OpenAPIGenerator(registry.definitions)
const document = generator.generateDocument({
    openapi: '3.0.0',
    info: {
        title: 'My API',
        version: '1.0.0',
    },
})

// Serve Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(document))

export { app, UserSchema, CreateUserDTO, UpdateUserDTO, GetUserQueryDTO }

app.listen(5000, () => {
    console.log('Server started on http://localhost:5000')
})
