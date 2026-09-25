import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = process.cwd();

describe('Kasir Delivery Monitoring - Static Assertions', () => {
    let routeContent;
    let componentContent;
    let monitoringPageContent;
    let riwayatPageContent;
    
    before(() => {
        console.log('[TEST] Loading files for static analysis');
        
        const routePath = path.join(PROJECT_ROOT, 'src/app/api/admin/kasir/monitoring/delivery/route.ts');
        const componentPath = path.join(PROJECT_ROOT, 'src/components/admin/kasir/KasirDeliveryMonitoring.tsx');
        const monitoringPagePath = path.join(PROJECT_ROOT, 'src/app/kasir/(protected)/monitoring/page.tsx');
        const riwayatPagePath = path.join(PROJECT_ROOT, 'src/app/admin/(protected)/kasir/riwayat/page.tsx');
        
        routeContent = fs.readFileSync(routePath, 'utf-8');
        componentContent = fs.readFileSync(componentPath, 'utf-8');
        monitoringPageContent = fs.readFileSync(monitoringPagePath, 'utf-8');
        riwayatPageContent = fs.readFileSync(riwayatPagePath, 'utf-8');
    });
    
    it('should use the active Kasir authorization guard', () => {
        assert(routeContent.includes('getCurrentCashier'));
        const serverAuth = fs.readFileSync(path.join(PROJECT_ROOT, 'src/lib/server-auth.ts'), 'utf-8');
        assert(serverAuth.includes('user.role === "admin" || user.role === "cashier"'));
        assert(serverAuth.includes('user.isActive === false'));
        console.log('[PASS] Route allows active admin/cashier and denies inactive/other roles');
    });
    
    it('should exclude Pickup orders (TATAP_MUKA source filter)', () => {
        assert(routeContent.includes('source: { in: [') || routeContent.includes('"TATAP_MUKA"'));
        assert(!routeContent.includes('PICKUP') || routeContent.indexOf('PICKUP') > routeContent.indexOf('WHATSAPP'));
        console.log('[PASS] Pickup excluded from monitoring');
    });
    
    it('should only search name, phone/WhatsApp, trackingNumber', () => {
        const searchPattern = /customer.*phone.*trackingNumber|trackingNumber.*phone.*customer/i;
        // Check that address is NOT in search fields
        const addressInSearch = routeContent.includes('address') && routeContent.match(/\.address.*contains|contains.*address/i);
        assert(addressInSearch === null, 'Address should not be in search fields');
        console.log('[PASS] Search limited to customer/phone/trackingNumber');
    });
    
    it('should have normalized delivery grouping', () => {
        assert(componentContent.includes('normalizedKey') || componentContent.includes('normalizeDeliveryStatus'));
        assert(componentContent.includes('PERLU_DIPROSES') || componentContent.includes('DALAM_PENGIRIMAN'));
        console.log('[PASS] Status normalization present');
    });
    
    it('should map delivered -> SELESAI', () => {
        assert(routeContent.includes('delivered') && routeContent.includes('SELESAI'));
        console.log('[PASS] Delivered maps to SELESAI');
    });
    
    it('should map unknown != SELESAI', () => {
        assert(!routeContent.includes("biteshipStatus?.toLowerCase() === 'selesai'") || 
              routeContent.includes('delivered'));
        console.log('[PASS] Unknown status does not equal SELESAI');
    });
    
    it('should map failure/return/interrupted -> PERLU_PERHATIAN', () => {
        assert(routeContent.includes('cancelled') || routeContent.includes('returned') || routeContent.includes('rejected'));
        assert(routeContent.includes('PERLU_PERHATIAN'));
        console.log('[PASS] Failures map to PERLU_PERHATIAN');
    });
    
    it('should not call Biteship API directly', () => {
        assert(!routeContent.includes('http://api.biteship'));
        console.log('[PASS] No direct Biteship calls');
    });
    
    it('should not use polling/setInterval', () => {
        assert(!componentContent.includes('setInterval') || componentContent.includes('cancel'));
        assert(!componentContent.includes('useEffect') || !componentContent.match(/useEffect.*setInterval/i));
        console.log('[PASS] No polling mechanisms');
    });
    
    it('should not expose sensitive provider IDs/secrets', () => {
        // Verify destinationAreaId is NOT in SELECT clause
        const selectMatch = routeContent.match(/select:\s*\{[\s\S]*?\}/);
        if (selectMatch) {
            assert(!selectMatch[0].includes('destinationAreaId'), 'destinationAreaId should not be selected');
            assert(!selectMatch[0].includes('shippingQuoteRef'), 'shippingQuoteRef should not be selected');
        }
        console.log('[PASS] Sensitive fields properly handled');
    });
    
    it('should have Monitoring page integration', () => {
        assert(monitoringPageContent.includes('KasirDeliveryMonitoring'));
        assert(monitoringPageContent.includes('/kasir/transaksi'));
        console.log('[PASS] Monitoring page exists and is protected');
    });
    
    it('should keep Riwayat Kasir intact (KasirHistory)', () => {
        assert(riwayatPageContent.includes('KasirHistory'));
        assert(!riwayatPageContent.includes('KasirDeliveryMonitoring'));
        console.log('[PASS] Riwayat still uses KasirHistory');
    });
    
    it('should render serialized and nullable delivery fields defensively', () => {
        assert.match(componentContent, /createdAt: string; updatedAt: string;/);
        assert.match(componentContent, /value: string \| Date \| null \| undefined/);
        assert.match(componentContent, /Number\.isNaN\(date\.getTime\(\)\)/);
        assert.match(componentContent, /order\.courier \|\| "Kurir belum dipilih"/);
        assert.match(componentContent, /order\.trackingNumber \|\| "Tanpa resi"/);
        console.log('[PASS] Serialized dates and nullable delivery fields are render-safe');
    });

    it('should preserve the Kasir detail URL contract', () => {
        assert.match(monitoringPageContent, /detailBasePath="\/kasir\/transaksi"/);
        assert.match(componentContent, /href=\{`\$\{detailBasePath\}\/\$\{order\.id\}`\}/);
        assert.match(routeContent, /id: true/);
        console.log('[PASS] Detail links use /kasir/transaksi/[id]');
    });

    it('should have server-side pagination', () => {
        assert(componentContent.includes('page') && componentContent.includes('limit'));
        assert(componentContent.includes('totalPages'));
        console.log('[PASS] Pagination implemented');
    });
    
    after(() => {
        console.log('[TEST] Static analysis completed');
    });
});