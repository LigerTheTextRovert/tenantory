// src/data-source.ts

import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

// Load environment variables
config();

export const AppDataSource = new DataSource({
	type: 'postgres',
	host: process.env.DB_HOST || 'localhost',
	port: Number(process.env.DB_PORT_EXTERNAL) || 5432,
	username: process.env.DB_USERNAME || 'tenantory_user',
	password: process.env.DB_PASSWORD || 'tenantory_pass',
	database: process.env.DB_DATABASE || 'tenantory_db',
	// entities: ['dist/**/*.entity.js'], // Use compiled JS files
	entities: ['src/**/*.entity.ts'],
	migrations: ['src/migrations/*.ts'],
	namingStrategy: new SnakeNamingStrategy(),
	synchronize: false,
	logging: process.env.NODE_ENV === 'development',
});
