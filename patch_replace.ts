import * as fs from 'fs';

let content = fs.readFileSync('frontend/src/app/admin/pages/upload/upload.component.ts', 'utf8');

const regex = /\/\/ Phase 1: groups \+ buildings \+ subjects \+ teachers in parallel.*await Promise\.all\(\[classroomsTask, subgroupsTask\]\);/s;

const replacement = `// Phase 1: buildings, subjects, teachers, groups
                const bCount = { count: createdCounts.buildings };
                await this.createItemsInBulk(
                    missingBuildings.filter(item => !state.buildings.has(this.buildCatalogKey(item.row.edificio))),
                    'CreateBuilding',
                    'CreateBuildingInput!',
                    (item) => ({ name: item.row.edificio, description: null }),
                    async (item) => await this.findBuildingIdByName(item.row.edificio),
                    (item, id) => state.buildings.set(this.buildCatalogKey(item.row.edificio), id),
                    (item) => \`el edificio \${item.row.edificio}\`,
                    bCount,
                    failures
                );
                createdCounts.buildings = bCount.count;

                const sCount = { count: createdCounts.subjects };
                await this.createItemsInBulk(
                    missingSubjects.filter(item => !state.subjects.has(this.buildCatalogKey(item.row.claveMateria))),
                    'CreateSubject',
                    'CreateSubjectInput!',
                    (item) => ({ code: item.row.claveMateria, name: item.row.materia, grade: item.row.grade ?? null, division: null }),
                    async () => 1,
                    (item, id) => state.subjects.set(this.buildCatalogKey(item.row.claveMateria), 1),
                    (item) => \`la materia \${item.row.claveMateria}\`,
                    sCount,
                    failures
                );
                createdCounts.subjects = sCount.count;

                const tCount = { count: createdCounts.teachers };
                await this.createItemsInBulk(
                    missingTeachers.filter(item => !state.teachers.has(this.buildCatalogKey(item.row.noEmpleado))),
                    'CreateTeacher',
                    'CreateTeacherInput!',
                    (item) => ({ employeeNumber: item.row.noEmpleado, name: item.row.docente, email: null }),
                    async () => 1,
                    (item, id) => state.teachers.set(this.buildCatalogKey(item.row.noEmpleado), 1),
                    (item) => \`el docente \${item.row.noEmpleado}\`,
                    tCount,
                    failures
                );
                createdCounts.teachers = tCount.count;

                const gCount = { count: createdCounts.groups };
                await this.createItemsInBulk(
                    missingGroups.filter(item => !state.groups.has(this.buildCatalogKey(item.row.grupo))),
                    'CreateGroup',
                    'CreateGroupInput!',
                    (item) => ({ name: item.row.grupo, parentId: null, grade: item.row.grade ?? null }),
                    async (item) => await this.findGroupIdByName(item.row.grupo, null),
                    (item, id) => state.groups.set(this.buildCatalogKey(item.row.grupo), id),
                    (item) => \`el grupo \${item.row.grupo}\`,
                    gCount,
                    failures,
                    20 // Lote menor por la dependencia de grados
                );
                createdCounts.groups = gCount.count;

                // Phase 2: classrooms + subgroups
                const validClassrooms = missingClassrooms.filter(item => {
                    const buildingKey = this.buildCatalogKey(item.row.edificio);
                    const buildingId = state.buildings.get(buildingKey);
                    if (!buildingId) {
                        failures.push(\`No se pudo resolver el edificio \${item.row.edificio} para crear el aula \${item.row.aula}.\`);
                        return false;
                    }
                    return !state.classrooms.has(this.buildClassroomKey(item.row.edificio, item.row.aula));
                });
                const cCount = { count: createdCounts.classrooms };
                await this.createItemsInBulk(
                    validClassrooms,
                    'CreateClassroom',
                    'CreateClassroomInput!',
                    (item) => ({ name: item.row.aula, buildingId: state.buildings.get(this.buildCatalogKey(item.row.edificio))! }),
                    async () => 1,
                    (item, id) => state.classrooms.set(this.buildClassroomKey(item.row.edificio, item.row.aula), 1),
                    (item) => \`el aula \${item.row.aula} en \${item.row.edificio}\`,
                    cCount,
                    failures,
                    20
                );
                createdCounts.classrooms = cCount.count;

                const validSubgroups = missingSubgroups.filter(item => {
                    if (!item.row.subgroup) return false;
                    const parentId = state.groups.get(this.buildCatalogKey(item.row.grupo));
                    if (!parentId) {
                        failures.push(\`No se pudo resolver el grupo padre \${item.row.grupo} para crear el subgrupo \${item.row.subgroup}.\`);
                        return false;
                    }
                    return !state.subgroups.has(this.buildSubgroupKey(item.row.grupo, item.row.subgroup));
                });
                const sgCount = { count: createdCounts.subgroups };
                await this.createItemsInBulk(
                    validSubgroups,
                    'CreateGroup',
                    'CreateGroupInput!',
                    (item) => ({ name: item.row.subgroup!, parentId: state.groups.get(this.buildCatalogKey(item.row.grupo))!, grade: null }),
                    async (item) => await this.findGroupIdByName(item.row.subgroup!, state.groups.get(this.buildCatalogKey(item.row.grupo))!),
                    (item, id) => state.subgroups.set(this.buildSubgroupKey(item.row.grupo, item.row.subgroup!), id),
                    (item) => \`el subgrupo \${item.row.subgroup}\`,
                    sgCount,
                    failures,
                    20
                );
                createdCounts.subgroups = sgCount.count;`;

if (!regex.test(content)) {
    console.error("No se encontró el bloque a reemplazar.");
} else {
    content = content.replace(regex, replacement);
    fs.writeFileSync('frontend/src/app/admin/pages/upload/upload.component.ts', content);
    console.log("Reemplazo exitoso");
}
