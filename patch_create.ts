import * as fs from 'fs';

let content = fs.readFileSync('frontend/src/app/admin/pages/upload/upload.component.ts', 'utf8');

const helper = `    private async createItemsInBulk<T>(
        items: T[],
        mutationName: string,
        inputTypeName: string,
        mapper: (item: T) => any,
        duplicateResolver: (item: T) => Promise<number | null>,
        stateSetter: (item: T, id: number) => void,
        errorMessageDesc: (item: T) => string,
        createdCounts: { count: number },
        failures: string[],
        batchSize: number = 30
    ): Promise<void> {
        for (let i = 0; i < items.length; i += batchSize) {
            const chunk = items.slice(i, i + batchSize);
            const variables: Record<string, any> = {};
            const mutationDefs: string[] = [];
            const calls: string[] = [];

            chunk.forEach((item, index) => {
                variables[\`input\${index}\`] = mapper(item);
                mutationDefs.push(\`$input\${index}: \${inputTypeName}\`);
                calls.push(\`alias\${index}: \${mutationName}(input: $input\${index}) { id }\`);
            });

            if (chunk.length === 0) continue;

            const queryStr = \`mutation Bulk\${mutationName}(\${mutationDefs.join(', ')}) {
                \${calls.join('\\n                ')}
            }\`;

            try {
                const response: any = await firstValueFrom(
                    this.apollo.mutate({
                        mutation: gql([\`\${queryStr}\`] as any),
                        variables,
                        errorPolicy: 'all',
                    })
                );

                const data = response.data || {};
                const errors = response.errors || [];
                const handledIndexes = new Set<number>();

                if (errors.length > 0) {
                    for (const err of errors) {
                        const path = (err.path && err.path[0]) ? err.path[0] : '';
                        if (path.startsWith('alias')) {
                            const idx = parseInt(path.replace('alias', ''), 10);
                            handledIndexes.add(idx);
                            const item = chunk[idx];
                            const apolloErr = { graphQLErrors: [err] };
                            if (this.isDuplicateCatalogError(apolloErr)) {
                                const resolved = await duplicateResolver(item);
                                if (resolved !== null) {
                                    stateSetter(item, resolved);
                                } else {
                                    failures.push(\`No se pudo resolver \${errorMessageDesc(item)} después de detectar un duplicado.\`);
                                }
                            } else {
                                failures.push(getGraphQLErrorMessage(apolloErr, \`No se pudo crear \${errorMessageDesc(item)}.\`));
                            }
                        }
                    }
                }

                chunk.forEach((item, index) => {
                    if (!handledIndexes.has(index)) {
                        const aliasData = data[\`alias\${index}\`];
                        if (aliasData && aliasData.id) {
                            stateSetter(item, Number(aliasData.id));
                            createdCounts.count += 1;
                        } else if (!handledIndexes.has(index)) {
                            failures.push(\`La respuesta del backend no contiene información válida para \${errorMessageDesc(item)}\`);
                        }
                    }
                });
            } catch (error) {
                for (const item of chunk) {
                    failures.push(getGraphQLErrorMessage(error, \`Fallo de red al crear \${errorMessageDesc(item)}.\`));
                }
            }
        }
    }

`;

content = content.replace('    async CreateMissingCatalogItems(): Promise<void> {', helper + '    async CreateMissingCatalogItems(): Promise<void> {');

fs.writeFileSync('frontend/src/app/admin/pages/upload/upload.component.ts', content);
