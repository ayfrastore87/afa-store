export async function fetchJsonSafe<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
    const response = await fetch(input, init);
    return parseJsonResponse<T>(response);
}

export async function parseJsonResponse<T>(response: Response): Promise<T> {
    const text = await response.text();

    if (!response.ok) {
        throw new Error(text);
    }

    try {
        return JSON.parse(text) as T;
    } catch {
        throw new Error("API returned HTML instead of JSON:\n" + text);
    }
}
