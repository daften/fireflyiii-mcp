import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRoutes } from '../../scripts/update-firefly-routes.mjs';

const php = `
Route::group(
    [
        'namespace' => 'FireflyIII\\Api\\V1\\Controllers\\Models\\Budget',
        'prefix'    => 'v1/budgets',
    ],
    static function (): void {
        Route::get('', ['uses' => 'ShowController@index', 'as' => 'index']);
        Route::put('{budget}/limits/{budgetLimit}', ['uses' => 'UpdateController@update', 'as' => 'limits.update']);
        // Route::post('trigger', ['uses' => 'RecurrenceController@trigger', 'as' => 'trigger']);
    }
);
Route::group(
    [
        'prefix'    => 'v1/webhooks',
    ],
    static function (): void {
        Route::delete(
            '{webhook}/messages/{webhookMessage}',
            ['uses' => 'DestroyController@destroyMessage', 'as' => 'messages.destroy']
        );
    }
);
Route::group(['prefix' => 'v2/net-worth'], static function (): void {
    Route::get('', ['uses' => 'NetWorthController@get']);
});
`;

test('joins each route to its group prefix and normalizes path parameters', () => {
  const routes = parseRoutes(php);
  assert.ok(routes.includes('GET /v1/budgets'));
  assert.ok(routes.includes('PUT /v1/budgets/{}/limits/{}'));
});

test('ignores commented-out routes, which Firefly III does not serve', () => {
  assert.ok(!parseRoutes(php).some((route) => route.includes('trigger')));
});

test('reads a route whose path is on the line after Route::<method>(', () => {
  assert.ok(parseRoutes(php).includes('DELETE /v1/webhooks/{}/messages/{}'));
});

test('keeps only the v1 API', () => {
  assert.ok(!parseRoutes(php).some((route) => route.includes('/v2/')));
});
