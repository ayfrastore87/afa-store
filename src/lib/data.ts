export type Product = {
    id: string;
    name: string;
    category: string;
    flavor?: string;
    size?: string;
    price: number;
    rating: number;
    reviews: number;
    stock: number;
    badge?: string;
    image: string;
};

export type Parcel = {
    id: string;
    name: string;
    category: string;
    price: number;
    rating: number;
    reviews: number;
    badge: string;
    image: string;
    items: string[];
};

export const productSizes = ["35g", "100g", "250g", "500g", "1 Kg"];

export const products: Product[] = [
    { id: "original-35", name: "Bawang Goreng Original", category: "Original", flavor: "Original", size: "35g", price: 18000, rating: 4.9, reviews: 128, stock: 84, badge: "Best Seller", image: "/products/bawang goreng original.jpeg" },
    { id: "pedas-35", name: "Bawang Goreng Pedas", category: "Pedas", flavor: "Pedas", size: "35g", price: 20000, rating: 4.8, reviews: 96, stock: 57, badge: "Best Seller", image: "/products/bawang goreng pedas.jpeg" },
    { id: "daun-jeruk-35", name: "Bawang Goreng Daun Jeruk", category: "Daun Jeruk", flavor: "Daun Jeruk", size: "35g", price: 20000, rating: 4.9, reviews: 87, stock: 68, badge: "Best Seller", image: "/products/bawang goreng daun jeruk.jpeg" },
    { id: "original-100", name: "Bawang Goreng Original 100g", category: "Original", flavor: "Original", size: "100g", price: 45000, rating: 4.8, reviews: 74, stock: 45, image: "/products/bawang goreng original.jpeg" },
    { id: "pedas-250", name: "Bawang Goreng Pedas 250g", category: "Pedas", flavor: "Pedas", size: "250g", price: 95000, rating: 4.7, reviews: 41, stock: 22, badge: "Promo", image: "/products/bawang goreng pedas.jpeg" },
    { id: "daun-500", name: "Bawang Daun Jeruk 500g", category: "Daun Jeruk", flavor: "Daun Jeruk", size: "500g", price: 175000, rating: 4.9, reviews: 33, stock: 17, image: "/products/bawang goreng daun jeruk.jpeg" },
];

const parcelItems = ["Bawang Goreng Original", "Bawang Goreng Pedas", "Bawang Goreng Daun Jeruk", "Sambal", "Kerupuk", "Kartu Ucapan", "Pita Premium", "Box Eksklusif"];

export const parcels: Parcel[] = [
    { id: "parcel-mini", name: "Parcel Mini", category: "Parcel Mini", price: 75000, rating: 4.8, reviews: 45, badge: "Promo", image: "/products/parcel 1.png", items: parcelItems.slice(0, 5) },
    { id: "parcel-silver", name: "Parcel Silver", category: "Parcel Silver", price: 150000, rating: 4.9, reviews: 38, badge: "Limited Edition", image: "/products/parcel 2.png", items: parcelItems.slice(0, 7) },
    { id: "parcel-gold", name: "Parcel Gold", category: "Parcel Gold", price: 250000, rating: 5, reviews: 62, badge: "Best Seller", image: "/products/parcel 3.png", items: parcelItems },
    { id: "parcel-premium", name: "Parcel Premium", category: "Parcel Premium", price: 500000, rating: 4.9, reviews: 29, badge: "Limited Edition", image: "/products/parcel 2.png", items: parcelItems },
    { id: "parcel-corporate", name: "Parcel Corporate", category: "Parcel Corporate", price: 1000000, rating: 5, reviews: 18, badge: "Best Seller", image: "/products/parcel 3.png", items: parcelItems },
];

export const testimonials = [
    ["Siti Aisyah", "Cilegon", "Bawang gorengnya benar-benar gurih dan renyah, bikin nagih!"],
    ["Andi Setiawan", "Serang", "Parcelnya cantik dan elegan, cocok untuk hadiah keluarga."],
    ["Dewi Sartika", "Pandeglang", "Pengiriman cepat, produk aman sampai tujuan."],
    ["Rina Marlina", "Jakarta", "Customer service sangat ramah dan responsif."],
    ["Budi Prakoso", "Bandung", "Tanpa tepung, rasa bawangnya asli dan wangi."],
    ["Maya Putri", "Tangerang", "Custom parcel corporate kami terlihat premium."],
    ["Hendra Wijaya", "Bekasi", "Repeat order untuk acara kantor, semua suka."],
    ["Nadia Rahma", "Depok", "Packaging aman, rasa pedasnya pas."],
];

export const formatRupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);