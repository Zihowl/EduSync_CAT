import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { provideHttpClient, withInterceptorsFromDi, HTTP_INTERCEPTORS } from '@angular/common/http';
import { inject } from '@angular/core';
import { provideApollo } from 'apollo-angular';
import { HttpLink } from 'apollo-angular/http';
import { InMemoryCache } from '@apollo/client/core';
import { environment } from './environments/environment';
import { addIcons } from 'ionicons';
import { settingsOutline, peopleOutline, logOutOutline, cloudUploadOutline, trashOutline, personOutline, personAddOutline, shieldCheckmarkOutline, bookOutline, layersOutline, businessOutline, homeOutline, informationCircleOutline } from 'ionicons/icons';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { AuthInterceptor } from './app/core/interceptors/auth.interceptor';

// Register commonly used icons globally to avoid runtime icon warnings
addIcons({ settingsOutline, peopleOutline, logOutOutline, cloudUploadOutline, trashOutline, personOutline, personAddOutline, shieldCheckmarkOutline, bookOutline, layersOutline, businessOutline, homeOutline, informationCircleOutline });

bootstrapApplication(AppComponent,
{
    providers: [
        {
            provide: RouteReuseStrategy, useClass: IonicRouteStrategy
        },
        provideIonicAngular(),
        provideRouter(routes, withPreloading(PreloadAllModules)),
        provideHttpClient(withInterceptorsFromDi()),
        {
            provide: HTTP_INTERCEPTORS,
            useClass: AuthInterceptor,
            multi: true
        },
        provideApollo(() =>
        {
            const httpLink = inject(HttpLink);

            return {
                link: httpLink.create({ uri: `${environment.apiUrl}/graphql` }),
                cache: new InMemoryCache(),
            };
        }),
    ],
});