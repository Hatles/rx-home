
export interface IDateTimeProvider
{
    now(): Date;
    today(): Date;
}

export class DateTimeProvider implements IDateTimeProvider
{
    public now(): Date {
        return new Date();
    }

    public today(): Date {
        return new Date();
    }
}

export class DateTimeProviders
{
    public static readonly Default: IDateTimeProvider = new DateTimeProvider();
}

export class Clock
{
    /// <summary>
    /// This object is used to perform all <see cref="Clock"/> operations.
    /// Default value: <see cref="DateTimeProvider"/>.
    /// </summary>
    private static _provider: IDateTimeProvider = DateTimeProviders.Default;

    static get provider(): IDateTimeProvider {
        return this._provider;
    }
    static set provider(value: IDateTimeProvider) {
        if (!value)
        {
            throw new Error("Can not set Provider to null!");
        }

        this._provider = value;
    }


    /// <summary>
    /// Gets Now using current <see cref="Provider"/>.
    /// </summary>
    public static now(): Date {
        return this.provider.now();
    }

    /// <summary>
    /// Gets Now using current <see cref="Provider"/>.
    /// </summary>
    public static today(): Date {
        return this.provider.today();
    }
}
