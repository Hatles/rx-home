import {INestApplication} from "@nestjs/common";
import {RxHomeCore} from "../core";
import {NestFactory} from "@nestjs/core";
import {AppModule} from "./app/app.module";
import {PluginDefinition} from "../plugins/plugin-manager";


export interface ApiPluginConfiguration {
    port?: number
    prefix?: string
}

export const NestJsApi = "RxHome_NestJsApi"

export class ApiPlugin implements Plugin<ApiPluginConfiguration> {
    private app: INestApplication;

    async init(core: RxHomeCore, params?: ApiPluginConfiguration): Promise<boolean> {

        this.app = await NestFactory.create(AppModule);
        core.services.registerInstance(NestJsApi, this.app);

        return true;
    }

    async afterInit(core: RxHomeCore, params?: ApiPluginConfiguration) {
        const globalPrefix = params?.prefix || 'api';
        const port = params?.port || 3333;

        this.app.setGlobalPrefix(globalPrefix);

        await this.app.listen(port, () => {
            core._logger.info('Listening at http://localhost:' + port + '/' + globalPrefix);
        });
    }

    async destroy(): Promise<boolean> {
        await this.app.close();

        return true;
    }
}

export const ApiPluginName = 'api'
export const ApiPluginVersion = '0.0.1'

export const ApiPluginDefinition: PluginDefinition<ApiPluginConfiguration> = {
    name: ApiPluginName,
    version: ApiPluginVersion,
    params: null,
    loader: () => new ApiPlugin()
}
