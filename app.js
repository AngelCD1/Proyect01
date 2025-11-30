const { useState, useEffect, useMemo, useCallback } = React;

// Importar funciones de Firebase desde los objetos globales
const {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    setDoc,
    onSnapshot,
    serverTimestamp
} = window.firebaseFirestore;

const {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} = window.firebaseAuthFunctions;

// ================== FUNCIÓN PARA GENERAR IDs ÚNICOS ==================
const generateUniqueId = (prefix = '') => {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substr(2, 9);
    const uniqueId = `${prefix}${timestamp}-${randomStr}`.toUpperCase();
    return uniqueId;
};

const InventoryManagementSystem = () => {
    const [products, setProducts] = useState([]);
    const [darkMode, setDarkMode] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState('name');
    const [filterCategory, setFilterCategory] = useState('all');
    const [activeTab, setActiveTab] = useState('caja');
    const [notification, setNotification] = useState(null);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState(null);
    const [loginData, setLoginData] = useState({ email: '', password: '' });
    const [sales, setSales] = useState([]);
    const [currentSale, setCurrentSale] = useState([]);
    const [showSaleModal, setShowSaleModal] = useState(false);
    const [showLoginModal, setShowLoginModal] = useState(false);

    // 🔍 NUEVO: Buscador de ventas
    const [searchSaleTerm, setSearchSaleTerm] = useState('');

    const [formData, setFormData] = useState({
        name: '',
        category: 'Electrónica',
        quantity: '',
        price: '',
        minStock: '',
        supplier: '',
        description: ''
    });


    const categories = ['Electrónica', 'Alimentos', 'Ropa', 'Hogar', 'Deportes', 'Salud', 'Belleza', 'Otros'];
    
    // ================== FUNCIONES DE NOTIFICACIÓN ==================
    const showNotification = useCallback((message, type = 'success') => {
        setNotification({ message, type, id: Date.now() });
        setTimeout(() => setNotification(null), 4000);
    }, []);

    // ================== VERIFICACIÓN DE FIREBASE ==================
    const checkFirebaseConnection = useCallback(() => {
        if (!window.firebaseDb) {
            console.error('❌ Firebase Database no está disponible');
            showNotification('Error: Firebase no está configurado', 'error');
            return false;
        }
        return true;
    }, [showNotification]);

    // ================== MODO OSCURO AUTOMÁTICO ==================
    useEffect(() => {
        const updateDarkMode = () => {
            const hour = new Date().getHours();
            const savedDarkMode = localStorage.getItem('darkMode');
            
            // Si el usuario ya configuró manualmente el modo, respetar su preferencia
            if (savedDarkMode !== null) {
                setDarkMode(savedDarkMode === 'true');
                return;
            }
            
            // Modo automático según la hora: oscuro de 19:00 a 6:00
            const isNightTime = hour >= 19 || hour < 6;
            setDarkMode(isNightTime);
            
            console.log(`🌙 Modo oscuro automático: ${isNightTime ? 'ACTIVADO' : 'DESACTIVADO'} (Hora: ${hour}:00)`);
        };

        // Ejecutar inmediatamente
        updateDarkMode();

        // Configurar intervalo para verificar cada hora
        const intervalId = setInterval(updateDarkMode, 60 * 60 * 1000); // Cada hora

        // Configurar para verificar cada minuto (para testing, puedes cambiarlo)
        const minuteIntervalId = setInterval(updateDarkMode, 60 * 1000);

        return () => {
            clearInterval(intervalId);
            clearInterval(minuteIntervalId);
        };
    }, []);

    // Guardar preferencia cuando el usuario cambie manualmente el modo oscuro
    useEffect(() => {
        localStorage.setItem('darkMode', darkMode.toString());
    }, [darkMode]);

    // ================== SISTEMA DE SUSCRIPCIÓN MEJORADO ==================
    const loadDataFromFirestore = useCallback(() => {
        try {
            setLoading(true);
            
            if (!checkFirebaseConnection()) {
                setLoading(false);
                return () => {};
            }

            console.log('🔄 Iniciando suscripción a datos en tiempo real...');

            let unsubscribeProducts = () => {};
            let unsubscribeSales = () => {};

            // Suscripción a productos
            try {
                const productsQuery = collection(window.firebaseDb, 'products');
                unsubscribeProducts = onSnapshot(productsQuery, 
                    (snapshot) => {
                        const productsData = snapshot.docs.map(doc => ({
                            id: doc.id,
                            ...doc.data()
                        }));
                        setProducts(productsData);
                        console.log('✅ Productos actualizados:', productsData.length);
                        setLoading(false);
                    }, 
                    (error) => {
                        console.error('❌ Error en productos:', error);
                        showNotification('Error al cargar productos: ' + error.message, 'error');
                        setLoading(false);
                    }
                );
            } catch (error) {
                console.error('Error en suscripción productos:', error);
                showNotification('Error al configurar productos: ' + error.message, 'error');
                setLoading(false);
            }

            // Suscripción a ventas
            try {
                const salesQuery = collection(window.firebaseDb, 'sales');
                unsubscribeSales = onSnapshot(salesQuery, 
                    (snapshot) => {
                        const salesData = snapshot.docs.map(doc => ({
                            id: doc.id,
                            ...doc.data()
                        }));
                        setSales(salesData);
                        console.log('✅ Ventas actualizadas:', salesData.length);
                    }, 
                    (error) => {
                        console.error('❌ Error en ventas:', error);
                        showNotification('Error al cargar ventas: ' + error.message, 'error');
                    }
                );
            } catch (error) {
                console.error('Error en suscripción ventas:', error);
            }

            return () => {
                console.log('🧹 Limpiando suscripciones...');
                unsubscribeProducts();
                unsubscribeSales();
            };
            
        } catch (error) {
            console.error('Error inicializando suscripciones:', error);
            showNotification('Error al configurar actualizaciones: ' + error.message, 'error');
            setLoading(false);
            return () => {};
        }
    }, [showNotification, checkFirebaseConnection]);

    // ================== SISTEMA DE AUTENTICACIÓN ==================
    useEffect(() => {
        let unsubscribeFirestore = () => {};
        
        const unsubscribeAuth = onAuthStateChanged(window.firebaseAuth, (user) => {
            console.log('🔐 Estado de autenticación:', user ? user.email : 'No autenticado');
            setUser(user);
            unsubscribeFirestore = loadDataFromFirestore();
        });
        
        return () => {
            unsubscribeAuth();
            unsubscribeFirestore();
        };
    }, [loadDataFromFirestore]);

    // ================== FUNCIONES DE FIRESTORE MEJORADAS ==================

    // Función para guardar productos
    const saveProductToFirestore = useCallback(async (product) => {
        try {
            if (!checkFirebaseConnection()) {
                throw new Error('Firebase no disponible');
            }

            if (product.id) {
                // Actualizar producto existente
                const productRef = doc(window.firebaseDb, 'products', product.id);
                
                const updateData = {
                    quantity: product.quantity,
                    updatedAt: serverTimestamp(),
                    lastUpdatedBy: user ? user.uid : 'caja-mode'
                };

                // Si es admin, puede actualizar todos los campos
                if (user) {
                    Object.assign(updateData, {
                        name: product.name,
                        category: product.category,
                        price: product.price,
                        minStock: product.minStock,
                        supplier: product.supplier,
                        description: product.description
                    });
                }

                await updateDoc(productRef, updateData);
                console.log('✅ Producto actualizado:', product.name);
                return product.id;
            } else {
                // Crear nuevo producto (SOLO admin)
                if (!user) {
                    throw new Error('Solo administradores pueden crear productos');
                }
                
                // Generar ID único para el producto
                const productId = generateUniqueId('PROD-');
                
                const productData = {
                    name: product.name,
                    category: product.category,
                    quantity: product.quantity,
                    price: product.price,
                    minStock: product.minStock,
                    supplier: product.supplier,
                    description: product.description,
                    productId: productId, // ID único personalizado
                    createdAt: serverTimestamp(),
                    createdBy: user.uid
                };

                // Usar el ID único como documento ID en Firestore
                const docRef = doc(window.firebaseDb, 'products', productId);
                await setDoc(docRef, productData);
                
                console.log('✅ Nuevo producto creado:', product.name, 'ID:', productId);
                return productId;
            }
        } catch (error) {
            console.error('❌ Error guardando producto:', error);
            if (error.code === 'permission-denied') {
                throw new Error('No tienes permisos para realizar esta acción. Verifica las reglas de Firestore.');
            }
            throw error;
        }
    }, [user, checkFirebaseConnection]);

    // Función para guardar ventas
    const saveSaleToFirestore = useCallback(async (sale) => {
        try {
            if (!checkFirebaseConnection()) {
                throw new Error('Firebase no disponible');
            }

            // Generar ID único para la venta
            const saleId = generateUniqueId('SALE-');
            const invoiceId = generateUniqueId('INV-');

            const saleData = {
                saleId: saleId, // ID único de la venta
                invoiceId: invoiceId, // ID único de la factura
                productId: sale.productId,
                productName: sale.productName,
                quantity: sale.quantity,
                price: sale.price,
                total: sale.total,
                date: new Date().toISOString(),
                createdAt: serverTimestamp(),
                userId: user ? user.uid : 'caja-mode',
                mode: user ? 'admin' : 'caja'
            };

            // Usar el ID único como documento ID en Firestore
            const docRef = doc(window.firebaseDb, 'sales', saleId);
            await setDoc(docRef, saleData);
            
            console.log('✅ Venta guardada:', sale.productName, 'ID Venta:', saleId, 'ID Factura:', invoiceId);
            return saleId;
        } catch (error) {
            console.error('❌ Error guardando venta:', error);
            if (error.code === 'permission-denied') {
                throw new Error('No tienes permisos para guardar ventas. Verifica las reglas de Firestore.');
            }
            throw error;
        }
    }, [user, checkFirebaseConnection]);

    // Función para eliminar productos
    const deleteProductFromFirestore = useCallback(async (productId) => {
        try {
            if (!checkFirebaseConnection()) {
                throw new Error('Firebase no disponible');
            }

            await deleteDoc(doc(window.firebaseDb, 'products', productId));
            console.log('✅ Producto eliminado:', productId);
        } catch (error) {
            console.error('❌ Error eliminando producto:', error);
            throw error;
        }
    }, [checkFirebaseConnection]);

    // ================== FUNCIONES DE VENTAS MEJORADAS ==================

    // Función para vender productos
    const markAsSold = useCallback(async (productId, quantity = 1) => {
        const product = products.find(p => p.id === productId);
        if (!product) {
            showNotification('Producto no encontrado', 'error');
            return;
        }

        if (product.quantity < quantity) {
            showNotification(`No hay suficiente stock. Solo quedan ${product.quantity} unidades`, 'error');
            return;
        }

        try {
            const sale = {
                productId,
                productName: product.name,
                quantity,
                price: product.price,
                total: product.price * quantity
            };

            console.log('🛒 Procesando venta:', sale);

            // Guardar venta
            await saveSaleToFirestore(sale);

            // Actualizar stock del producto
            const updatedProduct = {
                ...product,
                quantity: product.quantity - quantity
            };
            
            await saveProductToFirestore(updatedProduct);

            showNotification(`✓ ${quantity} ${product.name} vendido - $${sale.total}`, 'success');
        } catch (error) {
            console.error('❌ Error en markAsSold:', error);
            showNotification('Error al procesar la venta: ' + error.message, 'error');
        }
    }, [products, showNotification, saveSaleToFirestore, saveProductToFirestore]);

    // Función para procesar venta completa
    const processSale = useCallback(async () => {
        if (currentSale.length === 0) {
            showNotification('No hay productos en la venta', 'error');
            return;
        }

        try {
            // Verificar stock antes de procesar
            for (const item of currentSale) {
                const product = products.find(p => p.id === item.id);
                if (!product) {
                    showNotification(`Producto ${item.name} no encontrado`, 'error');
                    return;
                }
                if (product.quantity < item.quantity) {
                    showNotification(`No hay suficiente stock de ${item.name}. Solo quedan ${product.quantity} unidades`, 'error');
                    return;
                }
            }

            // Procesar cada producto en la venta
            for (const item of currentSale) {
                await markAsSold(item.id, item.quantity);
            }

            // Generar IDs únicos para la factura
            const invoiceId = generateUniqueId('INV-');
            const transactionId = generateUniqueId('TXN-');

            // Crear ID único legible para la factura
            
            const uniqueInvoiceId = `INV-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
            
            const invoice = {
                id: invoiceId,
                transactionId: transactionId,
                items: currentSale,
                total: saleTotal,
                date: new Date().toISOString(),
                userId: user ? user.uid : 'caja-mode',

    // NUEVO ID ÚNICO QUE TE PIDIERON
    invoiceNumber: uniqueInvoiceId
            };      
            try {
            if (checkFirebaseConnection()) {
                const invoiceRef = doc(window.firebaseDb, 'invoices', invoiceId);
                await setDoc(invoiceRef, {
                    ...invoice,
                    createdAt: serverTimestamp()
                });
    }      
            } catch (error) {
                console.warn('⚠️ No se pudo guardar la factura, pero la venta se procesó:', error);
            }

            // Limpiar venta actual
            setCurrentSale([]);
            setShowSaleModal(false);
            
            // Mostrar notificación con IDs
            if (saleTotal > 40000) {
                showNotification(`🎉 ¡VENTA MAYOR! Procesada - Total: $${saleTotal} | Factura: ${invoiceId}`, 'success');
            } else {
                showNotification(`✓ Venta procesada - Total: $${saleTotal} | Factura: ${invoiceId}`, 'success');
            }
            
            // Mostrar factura
            printInvoice(invoice);
        } catch (error) {
            console.error('❌ Error al procesar venta:', error);
            showNotification('Error al procesar la venta: ' + error.message, 'error');
        }
    }, [currentSale, saleTotal, user, markAsSold, showNotification, products, checkFirebaseConnection]);

    // ================== FUNCIONES DE CORREO ==================
    const sendLowStockEmail = useCallback(async (product) => {
        try {
            console.log('📧 Intentando enviar correo de alerta para:', product.name);
            
            if (!window.emailjs) {
                console.warn('EmailJS no está disponible');
                return;
            }
            
            const templateParams = {
                product_name: product.name,
                current_stock: product.quantity,
                min_stock: product.minStock,
                category: product.category,
                supplier: product.supplier || 'No especificado',
                to_email: 'angelcd659@gmail.com',
                date: new Date().toLocaleDateString('es-ES'),
                time: new Date().toLocaleTimeString('es-ES'),
                urgency_level: product.quantity === 0 ? 'CRÍTICA - SIN STOCK' : 
                            product.quantity <= product.minStock ? 'ALTA - Stock Bajo' : 'MEDIA - Stock por debajo del mínimo'
            };

            const response = await window.emailjs.send(
                'service_962fh0a', 
                'template_7iwlgxc', 
                templateParams
            );
            
            console.log('✅ Correo de alerta enviado exitosamente:', response.status, response.text);
            showNotification(`📧 Alerta enviada por correo: ${product.name}`, 'success');
            
        } catch (error) {
            console.error('❌ Error enviando correo:', error);
        }
    }, [showNotification]);

    const sendRestockEmail = useCallback(async (product, quantityAdded) => {
        try {
            if (!window.emailjs) {
                console.warn('EmailJS no está disponible');
                return;
            }

            const templateParams = {
                product_name: product.name,
                previous_stock: product.quantity - quantityAdded,
                current_stock: product.quantity,
                quantity_added: quantityAdded,
                min_stock: product.minStock,
                category: product.category,
                supplier: product.supplier || 'No especificado',
                to_email: 'angelcd659@gmail.com',
                date: new Date().toLocaleDateString('es-ES'),
                time: new Date().toLocaleTimeString('es-ES'),
                type: 'REABASTECIMIENTO EXITOSO'
            };

            await window.emailjs.send(
                'service_962fh0a',
                'template_7iwlgxc', 
                templateParams
            );
            
            console.log('✅ Correo de reabastecimiento enviado para:', product.name);
        } catch (error) {
            console.error('❌ Error enviando correo de reabastecimiento:', error);
        }
    }, []);

    // ================== FUNCIONES RESTANTES ==================

    // Función de login
    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            await signInWithEmailAndPassword(window.firebaseAuth, loginData.email, loginData.password);
            showNotification('Sesión de administrador iniciada', 'success');
            setShowLoginModal(false);
            setLoginData({ email: '', password: '' });
        } catch (error) {
            showNotification('Error al iniciar sesión: ' + error.message, 'error');
        }
    };

    // Función de logout
    const handleLogout = async () => {
        try {
            await signOut(window.firebaseAuth);
            showNotification('Sesión cerrada', 'success');
            setActiveTab('caja');
        } catch (error) {
            showNotification('Error al cerrar sesión', 'error');
        }
    };

    // Función para agregar a la venta
    const addToSale = useCallback((product) => {
        if (product.quantity === 0) {
            showNotification('Producto sin stock disponible', 'error');
            return;
        }
        
        const existingItem = currentSale.find(item => item.id === product.id);
        if (existingItem) {
            if (existingItem.quantity >= product.quantity) {
                showNotification('No hay suficiente stock disponible', 'error');
                return;
            }
            setCurrentSale(prev => prev.map(item =>
                item.id === product.id 
                    ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.price }
                    : item
            ));
        } else {
            setCurrentSale(prev => [...prev, {
                ...product,
                quantity: 1,
                total: product.price
            }]);
        }
        showNotification(`${product.name} agregado a la venta`, 'success');
    }, [currentSale, showNotification]);

    // Función para remover de la venta
    const removeFromSale = useCallback((productId) => {
        setCurrentSale(prev => prev.filter(item => item.id !== productId));
    }, []);

    // Función para actualizar cantidad en venta
    const updateSaleQuantity = useCallback((productId, newQuantity) => {
        if (newQuantity < 1) {
            removeFromSale(productId);
            return;
        }
        
        const product = products.find(p => p.id === productId);
        if (product && newQuantity > product.quantity) {
            showNotification(`Solo hay ${product.quantity} unidades disponibles`, 'error');
            return;
        }
        
        setCurrentSale(prev => prev.map(item =>
            item.id === productId 
                ? { ...item, quantity: newQuantity, total: newQuantity * item.price }
                : item
        ));
    }, [products, removeFromSale, showNotification]);

    // Calculadora de total de venta
    const saleTotal = useMemo(() => {
        return currentSale.reduce((sum, item) => sum + (item.total || 0), 0);
    }, [currentSale]);

    // Función para restablecer stock
    const restockProduct = useCallback(async (productId) => {
        if (!user) {
            showNotification('Solo administradores pueden modificar stock', 'error');
            return;
        }

        const product = products.find(p => p.id === productId);
        if (!product) return;

        const newQuantity = prompt(`¿Cuántas unidades deseas agregar a "${product.name}"?\nStock actual: ${product.quantity}`, "10");
        
        if (newQuantity && !isNaN(newQuantity) && parseInt(newQuantity) > 0) {
            try {
                const updatedProduct = {
                    ...product,
                    quantity: product.quantity + parseInt(newQuantity)
                };
                
                await saveProductToFirestore(updatedProduct);
                showNotification(`✓ Se agregaron ${newQuantity} unidades a ${product.name}`, 'success');
                
                // Enviar correo de confirmación de reabastecimiento
                await sendRestockEmail(updatedProduct, parseInt(newQuantity));
            } catch (error) {
                showNotification('Error al actualizar el stock', 'error');
            }
        }
    }, [products, user, showNotification, sendRestockEmail, saveProductToFirestore]);

    // Estadísticas calculadas
    const stats = useMemo(() => {
        const totalSales = sales.reduce((sum, sale) => sum + (sale.total || 0), 0);
        const totalUnitsSold = sales.reduce((sum, sale) => sum + (sale.quantity || 0), 0);
        
        return {
            totalProducts: products.length,
            totalValue: products.reduce((sum, p) => sum + (p.quantity * p.price), 0),
            lowStock: products.filter(p => p.quantity <= p.minStock && p.quantity > 0).length,
            outOfStock: products.filter(p => p.quantity === 0).length,
            categories: [...new Set(products.map(p => p.category))].length,
            totalUnits: products.reduce((sum, p) => sum + p.quantity, 0),
            totalSales,
            totalUnitsSold,
            avgSale: sales.length > 0 ? totalSales / sales.length : 0,
            criticalAlerts: products.filter(p => p.quantity === 0).length + products.filter(p => p.quantity <= p.minStock && p.quantity > 0).length
        };
    }, [products, sales]);

    const alertProducts = useMemo(() => 
        products.filter(p => p.quantity <= p.minStock)
    , [products]);

    // Filtrar y ordenar productos
    const filteredProducts = useMemo(() => {
        return products
            .filter(p => {
                const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                    (p.supplier && p.supplier.toLowerCase().includes(searchTerm.toLowerCase())) ||
                                    (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase()));
                const matchesCategory = filterCategory === 'all' || p.category === filterCategory;
                return matchesSearch && matchesCategory;
            })
            .sort((a, b) => {
                switch(sortBy) {
                    case 'name': return a.name.localeCompare(b.name);
                    case 'price': return b.price - a.price;
                    case 'quantity': return b.quantity - a.quantity;
                    case 'date': return new Date(b.date || (b.createdAt?.toDate ? b.createdAt.toDate() : 0)) - new Date(a.date || (a.createdAt?.toDate ? a.createdAt.toDate() : 0));
                    case 'value': return (b.quantity * b.price) - (a.quantity * a.price);
                    default: return 0;
                }
            });
    }, [products, searchTerm, filterCategory, sortBy]);

    // Manejar envío del formulario de productos (solo admin)
    const handleSubmit = useCallback(async () => {
        if (!user) {
            showNotification('Solo administradores pueden agregar productos', 'error');
            return;
        }

        if (!formData.name || !formData.quantity || !formData.price || !formData.minStock || !formData.supplier) {
            showNotification('Por favor completa todos los campos requeridos', 'error');
            return;
        }
        
        const quantity = parseInt(formData.quantity);
        const price = parseFloat(formData.price);
        const minStock = parseInt(formData.minStock);

        if (isNaN(quantity) || quantity < 0) {
            showNotification('La cantidad debe ser un número válido', 'error');
            return;
        }

        if (isNaN(price) || price <= 0) {
            showNotification('El precio debe ser un número mayor a 0', 'error');
            return;
        }

        if (isNaN(minStock) || minStock < 0) {
            showNotification('El stock mínimo debe ser un número válido', 'error');
            return;
        }

        try {
            if (editingProduct) {
                const updatedProduct = {
                    ...formData,
                    quantity: quantity,
                    price: price,
                    minStock: minStock,
                    id: editingProduct.id
                };
                
                await saveProductToFirestore(updatedProduct);
                showNotification('✓ Producto actualizado exitosamente', 'success');
                setEditingProduct(null);
            } else {
                const newProduct = {
                    ...formData,
                    quantity: quantity,
                    price: price,
                    minStock: minStock,
                    date: new Date().toISOString(),
                    trend: 'stable'
                };
                
                await saveProductToFirestore(newProduct);
                showNotification('✓ Producto agregado exitosamente', 'success');
            }
            
            setFormData({ name: '', category: 'Electrónica', quantity: '', price: '', minStock: '', supplier: '', description: '' });
            setShowForm(false);
        } catch (error) {
            showNotification('Error al guardar el producto: ' + error.message, 'error');
        }
    }, [formData, editingProduct, user, showNotification, saveProductToFirestore]);

    const handleEdit = useCallback((product) => {
        if (!user) {
            showNotification('Solo administradores pueden editar productos', 'error');
            return;
        }
        setEditingProduct(product);
        setFormData({
            ...product,
            quantity: product.quantity.toString(),
            price: product.price.toString(),
            minStock: product.minStock.toString()
        });
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [user, showNotification]);

    const handleDelete = useCallback(async (id) => {
        if (!user) {
            showNotification('Solo administradores pueden eliminar productos', 'error');
            return;
        }

        if (confirm('¿Estás seguro de eliminar este producto? Esta acción no se puede deshacer.')) {
            try {
                await deleteProductFromFirestore(id);
                showNotification('✓ Producto eliminado exitosamente', 'success');
            } catch (error) {
                showNotification('Error al eliminar el producto: ' + error.message, 'error');
            }
        }
    }, [user, showNotification, deleteProductFromFirestore]);

    // Función para imprimir factura
    const printInvoice = (invoice) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            showNotification('Error: No se pudo abrir la ventana de impresión. Por favor, permite ventanas emergentes.', 'error');
            return;
        }
        
        const invoiceHTML = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Factura ${invoice.id}</title>
                <style>
                    body { 
                        font-family: 'Arial', sans-serif; 
                        margin: 20px; 
                        background: white;
                        color: black;
                    }
                    .header { 
                        text-align: center; 
                        margin-bottom: 30px; 
                        border-bottom: 2px solid #333;
                        padding-bottom: 20px;
                    }
                    .company-info {
                        text-align: center;
                        margin-bottom: 20px;
                    }
                    .invoice-info { 
                        margin-bottom: 30px; 
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 20px;
                    }
                    .invoice-id {
                        background: #f0f0f0;
                        padding: 10px;
                        border-radius: 5px;
                        margin-bottom: 10px;
                        font-family: monospace;
                    }
                    table { 
                        width: 100%; 
                        border-collapse: collapse; 
                        margin-bottom: 30px; 
                    }
                    th, td { 
                        border: 1px solid #ddd; 
                        padding: 12px; 
                        text-align: left; 
                    }
                    th { 
                        background-color: #f2f2f2; 
                        font-weight: bold;
                    }
                    .total { 
                        text-align: right; 
                        font-size: 20px; 
                        font-weight: bold; 
                        margin-top: 20px;
                        border-top: 2px solid #333;
                        padding-top: 10px;
                    }
                    .footer {
                        margin-top: 50px;
                        text-align: center;
                        font-size: 12px;
                        color: #666;
                    }
                    @media print {
                        body { margin: 0; }
                        .no-print { display: none; }
                        .print-break { page-break-after: always; }
                    }
                    .btn {
                        padding: 10px 20px;
                        margin: 5px;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                        font-size: 14px;
                    }
                    .btn-print {
                        background: #007bff;
                        color: white;
                    }
                    .btn-pdf {
                        background: #dc3545;
                        color: white;
                    }
                    .btn-close {
                        background: #6c757d;
                        color: white;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>FACTURA DE VENTA</h1>
                    <div class="company-info">
                        <h2>TIENDA COMERCIAL</h2>
                        <p>Dirección: Av. Principal #123</p>
                        <p>Teléfono: (123) 456-7890</p>
                        <p>Email: info@tienda.com</p>
                    </div>
                </div>
                
                <!-- IDs Únicos -->
                <div class="invoice-id">
                    <strong>ID Factura:</strong> ${invoice.id}<br>
                    <strong>ID Transacción:</strong> ${invoice.transactionId}<br>
                    <strong>Número Factura:</strong> ${invoice.invoiceNumber}
                </div>
                
                <div class="invoice-info">
                    <div>
                        <p><strong>Fecha:</strong> ${new Date(invoice.date).toLocaleDateString('es-ES')}</p>
                        <p><strong>Hora:</strong> ${new Date(invoice.date).toLocaleTimeString('es-ES')}</p>
                    </div>
                    <div>
                        <p><strong>Cliente:</strong> CLIENTE GENERAL</p>
                        <p><strong>Vendedor:</strong> ${user ? 'ADMIN' : 'CAJA'}</p>
                        <p><strong>Forma de Pago:</strong> EFECTIVO</p>
                    </div>
                </div>
                
                <table>
                    <thead>
                        <tr>
                            <th>Producto</th>
                            <th>Cantidad</th>
                            <th>Precio Unit.</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${invoice.items.map(item => `
                            <tr>
                                <td>${item.name}</td>
                                <td>${item.quantity}</td>
                                <td>$${item.price.toFixed(2)}</td>
                                <td>$${item.total.toFixed(2)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                
                <div class="total">
                    <p>TOTAL: $${invoice.total.toFixed(2)}</p>
                </div>
                
                <div class="footer">
                    <p>¡Gracias por su compra!</p>
                    <p>Esta factura es un documento válido para contabilidad</p>
                    <p><small>IDs de referencia: ${invoice.id} | ${invoice.transactionId}</small></p>
                </div>
                
                <div class="no-print" style="margin-top: 30px; text-align: center;">
                    <button class="btn btn-print" onclick="window.print()">🖨️ Imprimir Factura</button>
                    <button class="btn btn-pdf" onclick="generatePDF()">📄 Guardar como PDF</button>
                    <button class="btn btn-close" onclick="window.close()">❌ Cerrar</button>
                </div>

                <script>
                    function generatePDF() {
                        window.print();
                    }
                </script>
            </body>
            </html>
        `;
        
        printWindow.document.write(invoiceHTML);
        printWindow.document.close();
    };

    // Crear iconos de lucide
    const createIcon = (iconName) => {
        return (props) => {
            const ref = React.useRef(null);
            useEffect(() => {
                if (ref.current && window.lucide) {
                    window.lucide.createIcons({ 
                        icons: { [iconName]: window.lucide[iconName] },
                        nameAttr: 'data-lucide',
                        attrs: props
                    });
                }
            }, []);
            return React.createElement('i', { 
                ref, 
                'data-lucide': iconName,
                className: props.className || '',
                style: { width: props.size || 24, height: props.size || 24 }
            });
        };
    };

    // Definir iconos
    const Package = createIcon('package');
    const BarChart3 = createIcon('bar-chart-3');
    const TrendingUp = createIcon('trending-up');
    const AlertTriangle = createIcon('alert-triangle');
    const Download = createIcon('download');
    const Moon = createIcon('moon');
    const Sun = createIcon('sun');
    const Plus = createIcon('plus');
    const Edit2 = createIcon('edit-2');
    const Trash2 = createIcon('trash-2');
    const Search = createIcon('search');
    const ShoppingCart = createIcon('shopping-cart');
    const DollarSign = createIcon('dollar-sign');
    const Calendar = createIcon('calendar');
    const ArrowUpRight = createIcon('arrow-up-right');
    const ArrowDownRight = createIcon('arrow-down-right');
    const X = createIcon('x');
    const FileText = createIcon('file-text');
    const CheckCircle = createIcon('check-circle');
    const RotateCcw = createIcon('rotate-ccw');
    const Table = createIcon('table');
    const LogOut = createIcon('log-out');
    const LogIn = createIcon('log-in');
    const User = createIcon('user');
    const Store = createIcon('store');
    const Settings = createIcon('settings');

    const theme = darkMode ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white' : 'bg-gradient-to-br from-blue-50 via-white to-purple-50 text-gray-900';
    const cardBg = darkMode ? 'bg-gray-800/90 backdrop-blur-sm' : 'bg-white/90 backdrop-blur-sm';
    const inputBg = darkMode ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-900 border-gray-300';
    const navBg = darkMode ? 'bg-gray-800/95 border-gray-700' : 'bg-blue-600/95 border-blue-500 text-white';

    // Pantalla de carga
    if (loading) {
        return (
            <div className={`min-h-screen flex items-center justify-center ${theme}`}>
                <div className="text-center">
                    <div className="w-20 h-20 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-xl font-semibold">Cargando Sistema...</p>
                </div>
            </div>
        );
    }

    // Tarjeta de producto completa
    const ProductCard = ({ product }) => (
        <div className={`${cardBg} rounded-2xl p-6 shadow-xl border-2 ${
            product.quantity === 0 ? 'border-red-500' :
            product.quantity <= product.minStock ? 'border-orange-500' : 
            darkMode ? 'border-gray-700' : 'border-gray-200'
        } hover-lift card-shine`}>
            {/* Product Header */}
            <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                    <h3 className="font-bold text-lg mb-2 line-clamp-2">{product.name}</h3>
                    <span className={`inline-block px-3 py-1 text-xs rounded-full font-medium ${
                        darkMode ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-800'
                    }`}>
                        {product.category}
                    </span>
                    {product.productId && (
                        <div className="mt-1 text-xs text-gray-500 font-mono">
                            ID: {product.productId}
                        </div>
                    )}
                </div>
                <div className="flex gap-2">
                    {user && (
                        <>
                            <button
                                onClick={() => restockProduct(product.id)}
                                className="p-2 rounded-lg bg-blue-500/20 text-blue-500 hover:bg-blue-500 hover:text-white transition-all duration-300"
                                title="Restablecer stock"
                            >
                                <RotateCcw size={16} />
                            </button>
                            <button
                                onClick={() => handleEdit(product)}
                                className="p-2 rounded-lg bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500 hover:text-white transition-all duration-300"
                                title="Editar"
                            >
                                <Edit2 size={16} />
                            </button>
                            <button
                                onClick={() => handleDelete(product.id)}
                                className="p-2 rounded-lg bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white transition-all duration-300"
                                title="Eliminar"
                            >
                                <Trash2 size={16} />
                            </button>
                        </>
                    )}
                    <button
                        onClick={() => markAsSold(product.id, 1)}
                        className="p-2 rounded-lg bg-green-500/20 text-green-500 hover:bg-green-500 hover:text-white transition-all duration-300"
                        title="Vender 1 unidad"
                    >
                        <CheckCircle size={16} />
                    </button>
                </div>
            </div>

            {/* Product Description */}
            {product.description && (
                <p className="text-sm text-gray-500 mb-4 line-clamp-2">{product.description}</p>
            )}

            {/* Stats */}
            <div className="space-y-3 mb-4">
                <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500 font-medium">📦 Cantidad:</span>
                    <span className={`font-bold ${
                        product.quantity === 0 ? 'text-red-500' :
                        product.quantity <= product.minStock ? 'text-orange-500' : 'text-green-500'
                    }`}>
                        {product.quantity} uds
                    </span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500 font-medium">💰 Precio:</span>
                    <span className="font-bold text-green-500">${product.price.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500 font-medium">💎 Valor Total:</span>
                    <span className="font-bold text-purple-500">${(product.quantity * product.price).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500 font-medium">🏭 Proveedor:</span>
                    <span className="font-medium text-sm truncate max-w-[120px]">{product.supplier}</span>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
                <div className="flex justify-between text-xs text-gray-500">
                    <span>Nivel de Stock</span>
                    <span className="font-semibold">{product.minStock} mínimo</span>
                </div>
                <div className={`w-full h-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-200'} rounded-full overflow-hidden shadow-inner`}>
                    <div 
                        className={`h-full progress-bar rounded-full ${
                            product.quantity === 0 ? 'bg-gradient-to-r from-red-500 to-red-600' :
                            product.quantity <= product.minStock 
                                ? 'bg-gradient-to-r from-orange-500 to-orange-600' 
                                : 'bg-gradient-to-r from-green-500 to-green-600'
                        }`}
                        style={{ width: `${Math.min((product.quantity / (product.minStock * 2)) * 100, 100)}%` }}
                    />
                </div>
            </div>

            {/* Alert Badge */}
            {product.quantity === 0 ? (
                <div className="mt-4 flex items-center gap-2 p-2 bg-red-500/20 rounded-lg border border-red-500 badge-pulse">
                    <AlertTriangle size={16} className="text-red-500" />
                    <span className="text-xs text-red-500 font-bold">❌ SIN STOCK - Urgente</span>
                </div>
            ) : product.quantity <= product.minStock && (
                <div className="mt-4 flex items-center gap-2 p-2 bg-orange-500/20 rounded-lg border border-orange-500 badge-pulse">
                    <AlertTriangle size={16} className="text-orange-500" />
                    <span className="text-xs text-orange-500 font-bold">⚠️ Stock Bajo - Reabastecer</span>
                </div>
            )}

            {/* Action Buttons */}
            <div className="mt-4 flex gap-2">
                <button
                    onClick={() => markAsSold(product.id, 1)}
                    className="flex-1 bg-gradient-to-r from-green-500 to-green-600 text-white py-2 px-3 rounded-lg text-sm font-medium hover:from-green-600 hover:to-green-700 transition-all duration-300 flex items-center justify-center gap-2"
                >
                    <CheckCircle size={14} />
                    Vender 1
                </button>
                {user && (
                    <button
                        onClick={() => restockProduct(product.id)}
                        className="bg-gradient-to-r from-blue-500 to-blue-600 text-white py-2 px-3 rounded-lg text-sm font-medium hover:from-blue-600 hover:to-blue-700 transition-all duration-300 flex items-center justify-center gap-2"
                    >
                        <RotateCcw size={14} />
                        Stock
                    </button>
                )}
            </div>

            {/* Date */}
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-xs text-gray-500">
                <div className="flex items-center gap-1">
                    <Calendar size={14} />
                    <span>{new Date(product.date || product.createdAt?.toDate() || new Date()).toLocaleDateString('es-ES')}</span>
                </div>
            </div>
        </div>
    );

    // Formulario de producto completo MEJORADO
    const ProductForm = () => {
        // Validación en tiempo real
        const isFormValid = useMemo(() => {
            return (
                formData.name.trim() !== '' &&
                formData.quantity !== '' &&
                !isNaN(formData.quantity) &&
                parseInt(formData.quantity) >= 0 &&
                formData.price !== '' &&
                !isNaN(formData.price) &&
                parseFloat(formData.price) > 0 &&
                formData.minStock !== '' &&
                !isNaN(formData.minStock) &&
                parseInt(formData.minStock) >= 0 &&
                formData.supplier.trim() !== ''
            );
        }, [formData]);

        // Calcular valor total del producto
        const totalValue = useMemo(() => {
            const quantity = parseInt(formData.quantity) || 0;
            const price = parseFloat(formData.price) || 0;
            return quantity * price;
        }, [formData.quantity, formData.price]);

        return (
            <div className={`${cardBg} rounded-2xl p-6 shadow-2xl border-2 border-blue-500 animate-bounce-in`}>
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-2xl font-bold flex items-center gap-3">
                        {editingProduct ? (
                            <>
                                <Edit2 size={28} className="text-blue-500" />
                                <span>Editar Producto</span>
                            </>
                        ) : (
                            <>
                                <Plus size={28} className="text-blue-500" />
                                <span>Agregar Nuevo Producto</span>
                            </>
                        )}
                    </h3>
                    
                    {/* Valor total en tiempo real */}
                    {totalValue > 0 && (
                        <div className={`px-4 py-2 rounded-lg ${
                            darkMode ? 'bg-blue-900/50' : 'bg-blue-100'
                        } border border-blue-300`}>
                            <span className="text-sm text-gray-600 dark:text-gray-300 font-medium">Valor Total:</span>
                            <span className="ml-2 text-lg font-bold text-green-600">${totalValue.toLocaleString()}</span>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Nombre del Producto */}
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-1">
                            <span>Nombre del Producto</span>
                            <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            placeholder="Ej: MacBook Pro M3 16&quot;"
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            className={`${inputBg} w-full px-4 py-3 rounded-xl border-2 transition-all duration-300 font-medium ${
                                formData.name.trim() === '' ? 'border-red-300' : 'border-green-300'
                            }`}
                        />
                        {formData.name.trim() === '' && (
                            <p className="text-red-500 text-xs">Este campo es requerido</p>
                        )}
                    </div>
                    
                    {/* Categoría */}
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-1">
                            <span>Categoría</span>
                            <span className="text-red-500">*</span>
                        </label>
                        <select
                            value={formData.category}
                            onChange={(e) => setFormData({...formData, category: e.target.value})}
                            className={`${inputBg} w-full px-4 py-3 rounded-xl border-2 border-blue-300 transition-all duration-300 font-medium`}
                        >
                            {categories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>

                    {/* Cantidad en Stock */}
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-1">
                            <span>Cantidad en Stock</span>
                            <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="number"
                            placeholder="0"
                            value={formData.quantity}
                            onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                            className={`${inputBg} w-full px-4 py-3 rounded-xl border-2 transition-all duration-300 font-medium ${
                                formData.quantity === '' || isNaN(formData.quantity) || parseInt(formData.quantity) < 0 
                                    ? 'border-red-300' 
                                    : 'border-green-300'
                            }`}
                            min="0"
                        />
                        {(formData.quantity === '' || isNaN(formData.quantity) || parseInt(formData.quantity) < 0) && (
                            <p className="text-red-500 text-xs">Ingrese una cantidad válida</p>
                        )}
                    </div>

                    {/* Precio Unitario */}
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-1">
                            <span>Precio Unitario</span>
                            <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500 font-bold">$</span>
                            <input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={formData.price}
                                onChange={(e) => setFormData({...formData, price: e.target.value})}
                                className={`${inputBg} w-full pl-8 pr-4 py-3 rounded-xl border-2 transition-all duration-300 font-medium ${
                                    formData.price === '' || isNaN(formData.price) || parseFloat(formData.price) <= 0 
                                        ? 'border-red-300' 
                                        : 'border-green-300'
                                }`}
                                min="0.01"
                            />
                        </div>
                        {(formData.price === '' || isNaN(formData.price) || parseFloat(formData.price) <= 0) && (
                            <p className="text-red-500 text-xs">Ingrese un precio válido mayor a 0</p>
                        )}
                    </div>

                    {/* Stock Mínimo */}
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-1">
                            <span>Stock Mínimo</span>
                            <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="number"
                            placeholder="0"
                            value={formData.minStock}
                            onChange={(e) => setFormData({...formData, minStock: e.target.value})}
                            className={`${inputBg} w-full px-4 py-3 rounded-xl border-2 transition-all duration-300 font-medium ${
                                formData.minStock === '' || isNaN(formData.minStock) || parseInt(formData.minStock) < 0 
                                    ? 'border-red-300' 
                                    : 'border-green-300'
                            }`}
                            min="0"
                        />
                        {(formData.minStock === '' || isNaN(formData.minStock) || parseInt(formData.minStock) < 0) && (
                            <p className="text-red-500 text-xs">Ingrese un stock mínimo válido</p>
                        )}
                        
                        {/* Indicador de relación stock actual vs mínimo */}
                        {formData.quantity !== '' && formData.minStock !== '' && 
                        !isNaN(formData.quantity) && !isNaN(formData.minStock) && (
                            <div className="mt-2">
                                <div className="flex justify-between text-xs mb-1">
                                    <span className="text-gray-600 dark:text-gray-300">
                                        Relación Stock Actual / Mínimo
                                    </span>
                                    <span className={`font-bold ${
                                        parseInt(formData.quantity) <= parseInt(formData.minStock) 
                                            ? 'text-red-500' 
                                            : 'text-green-500'
                                    }`}>
                                        {parseInt(formData.quantity)} / {parseInt(formData.minStock)}
                                    </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div 
                                        className={`h-2 rounded-full ${
                                            parseInt(formData.quantity) <= parseInt(formData.minStock) 
                                                ? 'bg-red-500' 
                                                : 'bg-green-500'
                                        }`}
                                        style={{ 
                                            width: `${Math.min((parseInt(formData.quantity) / parseInt(formData.minStock)) * 100, 100)}%` 
                                        }}
                                    ></div>
                                </div>
                                {parseInt(formData.quantity) <= parseInt(formData.minStock) && (
                                    <p className="text-red-500 text-xs mt-1">
                                        ⚠️ El stock actual está en o por debajo del mínimo
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Proveedor */}
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-1">
                            <span>Proveedor</span>
                            <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            placeholder="Ej: Apple Store"
                            value={formData.supplier}
                            onChange={(e) => setFormData({...formData, supplier: e.target.value})}
                            className={`${inputBg} w-full px-4 py-3 rounded-xl border-2 transition-all duration-300 font-medium ${
                                formData.supplier.trim() === '' ? 'border-red-300' : 'border-green-300'
                            }`}
                        />
                        {formData.supplier.trim() === '' && (
                            <p className="text-red-500 text-xs">Este campo es requerido</p>
                        )}
                    </div>

                    {/* Descripción */}
                    <div className="md:col-span-2 space-y-2">
                        <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                            Descripción (Opcional)
                        </label>
                        <textarea
                            placeholder="Descripción detallada del producto, características, especificaciones técnicas..."
                            value={formData.description}
                            onChange={(e) => setFormData({...formData, description: e.target.value})}
                            className={`${inputBg} w-full px-4 py-3 rounded-xl border-2 border-blue-300 transition-all duration-300 resize-none font-medium`}
                            rows="3"
                        />
                        <p className="text-xs text-gray-500">
                            Características, especificaciones o notas importantes sobre el producto
                        </p>
                    </div>

                    {/* Resumen del Producto */}
                    <div className="md:col-span-2">
                        <div className={`p-4 rounded-xl ${
                            darkMode ? 'bg-gray-700' : 'bg-gray-50'
                        } border-2 border-dashed border-gray-300`}>
                            <h4 className="font-semibold text-lg mb-3 text-gray-700 dark:text-gray-300">
                                📊 Resumen del Producto
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                <div>
                                    <span className="text-gray-600 dark:text-gray-400">Valor Total:</span>
                                    <p className="font-bold text-green-600 text-lg">${totalValue.toLocaleString()}</p>
                                </div>
                                <div>
                                    <span className="text-gray-600 dark:text-gray-400">Estado Stock:</span>
                                    <p className={`font-bold ${
                                        formData.quantity && formData.minStock && 
                                        parseInt(formData.quantity) <= parseInt(formData.minStock) 
                                            ? 'text-red-500' 
                                            : 'text-green-500'
                                    }`}>
                                        {formData.quantity && formData.minStock ? 
                                            (parseInt(formData.quantity) <= parseInt(formData.minStock) ? '⚠️ Bajo' : '✅ Normal') 
                                            : '-'
                                        }
                                    </p>
                                </div>
                                <div>
                                    <span className="text-gray-600 dark:text-gray-400">Categoría:</span>
                                    <p className="font-bold text-blue-600">{formData.category}</p>
                                </div>
                                <div>
                                    <span className="text-gray-600 dark:text-gray-400">Formulario:</span>
                                    <p className={`font-bold ${
                                        isFormValid ? 'text-green-500' : 'text-red-500'
                                    }`}>
                                        {isFormValid ? '✅ Listo' : '❌ Incompleto'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Botones de acción */}
                    <div className="md:col-span-2 flex gap-3">
                        <button
                            onClick={handleSubmit}
                            disabled={!isFormValid}
                            className={`flex-1 px-6 py-3 rounded-xl shadow-lg font-semibold text-lg transition-all duration-300 ${
                                isFormValid 
                                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 hover:scale-105' 
                                    : 'bg-gray-400 text-gray-200 cursor-not-allowed'
                            }`}
                        >
                            {editingProduct ? '✓ Actualizar Producto' : '+ Guardar Producto'}
                        </button>
                        <button
                            onClick={() => {
                                setShowForm(false);
                                setEditingProduct(null);
                                setFormData({ 
                                    name: '', 
                                    category: 'Electrónica', 
                                    quantity: '', 
                                    price: '', 
                                    minStock: '', 
                                    supplier: '', 
                                    description: '' 
                                });
                            }}
                            className={`px-8 py-3 rounded-xl ${
                                darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'
                            } transition-all duration-300 hover:scale-105 font-semibold`}
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // Dashboard del Admin
    const AdminDashboard = () => (
        <div className="space-y-6 animate-fade-in">
            {/* Main Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { title: 'Total Productos', value: stats.totalProducts, change: '+12%', color: 'blue', icon: Package },
                    { title: 'Valor Total', value: `$${(stats.totalValue / 1000).toFixed(1)}k`, change: '+23%', color: 'green', icon: DollarSign },
                    { title: 'Ventas Totales', value: `$${(stats.totalSales / 1000).toFixed(1)}k`, change: '+18%', color: 'emerald', icon: ShoppingCart },
                    { title: 'Alertas Activas', value: stats.criticalAlerts, change: stats.criticalAlerts > 0 ? 'Atención' : '✓ OK', color: stats.criticalAlerts > 0 ? 'red' : 'green', icon: AlertTriangle }
                ].map((stat, idx) => (
                    <div key={idx} className={`${cardBg} rounded-2xl p-6 shadow-xl border ${darkMode ? 'border-gray-700' : 'border-gray-200'} hover-lift card-shine`}>
                        <div className="flex items-center justify-between mb-4">
                            <div className={`p-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-100'} rounded-xl`}>
                                <stat.icon size={32} className={`text-${stat.color}-500`} />
                            </div>
                            <TrendingUp size={24} className={`text-${stat.color === 'red' ? 'red' : stat.color}-500`} />
                        </div>
                        <p className="text-sm text-gray-500 mb-1">{stat.title}</p>
                        <p className="text-4xl font-bold mb-2">{stat.value}</p>
                        <p className={`text-xs flex items-center gap-1 ${stat.color === 'red' ? 'text-red-500' : `text-${stat.color}-500`}`}>
                            <span>{stat.change}</span>
                        </p>
                    </div>
                ))}
            </div>

            {/* Quick Actions */}
            <div className={`${cardBg} rounded-2xl p-6 shadow-xl border ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <span>⚡</span> Acciones Rápidas
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { label: 'Nuevo Producto', icon: Plus, color: 'blue', action: () => { setActiveTab('productos'); setShowForm(true); } },
                        { label: 'Ver Alertas', icon: AlertTriangle, color: 'red', action: () => setActiveTab('alertas') },
                        { label: 'Ver Ventas', icon: ShoppingCart, color: 'green', action: () => setActiveTab('ventas') },
                        { label: 'Buscar', icon: Search, color: 'purple', action: () => setActiveTab('productos') }
                    ].map((btn, idx) => (
                        <button 
                            key={idx}
                            onClick={btn.action}
                            className={`flex flex-col items-center gap-3 p-6 rounded-xl bg-gradient-to-br from-${btn.color}-500 to-${btn.color}-600 text-white hover:from-${btn.color}-600 hover:to-${btn.color}-700 transition-all duration-300 hover:scale-105 hover:shadow-2xl transform`}
                        >
                            <btn.icon size={32} />
                            <span className="text-sm font-medium text-center">{btn.label}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );

    // Alertas del Admin
    const AdminAlerts = () => (
        <div className="space-y-6 animate-fade-in">
            <div className={`${cardBg} rounded-2xl p-6 shadow-xl border ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-red-500/20 rounded-xl">
                        <AlertTriangle size={32} className="text-red-500 badge-pulse" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold">⚠️ Sistema de Alertas</h2>
                        <p className="text-sm text-gray-500">Productos que requieren atención inmediata</p>
                    </div>
                </div>

                {alertProducts.length === 0 && stats.outOfStock === 0 ? (
                    <div className="text-center py-16 animate-bounce-in">
                        <div className="inline-block p-8 bg-green-500/20 rounded-full mb-6">
                            <Package size={64} className="text-green-500" />
                        </div>
                        <h3 className="text-3xl font-bold text-green-500 mb-3">🎉 ¡Todo en orden!</h3>
                        <p className="text-gray-500 mb-6 text-lg">No hay productos con stock bajo en este momento</p>
                        <button
                            onClick={() => setActiveTab('productos')}
                            className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-8 py-4 rounded-xl shadow-lg font-semibold text-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-300"
                        >
                            <Package className="inline mr-2" size={24} />
                            Ver Todos los Productos
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className={`p-5 rounded-xl ${darkMode ? 'bg-red-900/30' : 'bg-red-50'} border-2 border-red-500 mb-6`}>
                            <div className="flex items-center gap-3">
                                <AlertTriangle size={24} className="text-red-500 flex-shrink-0" />
                                <div>
                                    <p className="font-bold text-red-500 text-lg">
                                        ⚠️ {stats.criticalAlerts} producto{stats.criticalAlerts > 1 ? 's' : ''} requiere{stats.criticalAlerts === 1 ? '' : 'n'} atención inmediata
                                    </p>
                                    <p className="text-sm text-gray-500 mt-1">
                                        {stats.outOfStock > 0 && `${stats.outOfStock} sin stock • `}
                                        {stats.lowStock > 0 && `${stats.lowStock} con stock bajo`}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Productos sin stock */}
                        {products.filter(p => p.quantity === 0).length > 0 && (
                            <div className="mb-6">
                                <h3 className="text-xl font-bold mb-4 text-red-500 flex items-center gap-2">
                                    <span>❌</span> Productos Sin Stock ({stats.outOfStock})
                                </h3>
                                {products.filter(p => p.quantity === 0).map(product => (
                                    <div 
                                        key={product.id} 
                                        className={`border-l-4 border-red-500 ${darkMode ? 'bg-red-900/20' : 'bg-red-50'} p-6 rounded-xl hover-lift mb-4`}
                                    >
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div className="flex-1">
                                                <div className="flex items-start gap-3 mb-4">
                                                    <div className="p-3 bg-red-500/20 rounded-xl">
                                                        <Package size={28} className="text-red-500" />
                                                    </div>
                                                    <div className="flex-1">
                                                        <h3 className="font-bold text-xl mb-1">{product.name}</h3>
                                                        <p className="text-sm text-gray-600 dark:text-gray-400">
                                                            📦 {product.category} • 🏭 {product.supplier}
                                                        </p>
                                                        {product.description && (
                                                            <p className="text-sm text-gray-500 mt-2">{product.description}</p>
                                                        )}
                                                        <div className="mt-2 inline-block px-3 py-1 bg-red-500 text-white text-xs font-bold rounded-full badge-pulse">
                                                            ❌ SIN STOCK - URGENTE
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex md:flex-col gap-3">
                                                <button
                                                    onClick={() => {
                                                        setActiveTab('productos');
                                                        handleEdit(product);
                                                    }}
                                                    className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all duration-300 hover:scale-105 shadow-lg whitespace-nowrap font-semibold"
                                                >
                                                    <Edit2 size={18} />
                                                    <span>Actualizar</span>
                                                </button>
                                                <button
                                                    onClick={() => restockProduct(product.id)}
                                                    className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-3 rounded-xl hover:from-green-600 hover:to-green-700 transition-all duration-300 hover:scale-105 shadow-lg whitespace-nowrap font-semibold"
                                                >
                                                    <RotateCcw size={18} />
                                                    <span>Agregar Stock</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Productos con stock bajo */}
                        {products.filter(p => p.quantity <= p.minStock && p.quantity > 0).length > 0 && (
                            <div>
                                <h3 className="text-xl font-bold mb-4 text-orange-500 flex items-center gap-2">
                                    <span>⚠️</span> Productos con Stock Bajo ({stats.lowStock})
                                </h3>
                                {products.filter(p => p.quantity <= p.minStock && p.quantity > 0).map(product => (
                                    <div 
                                        key={product.id} 
                                        className={`border-l-4 border-orange-500 ${darkMode ? 'bg-orange-900/20' : 'bg-orange-50'} p-6 rounded-xl hover-lift mb-4`}
                                    >
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div className="flex-1">
                                                <div className="flex items-start gap-3 mb-4">
                                                    <div className="p-3 bg-orange-500/20 rounded-xl">
                                                        <Package size={28} className="text-orange-500" />
                                                    </div>
                                                    <div className="flex-1">
                                                        <h3 className="font-bold text-xl mb-1">{product.name}</h3>
                                                        <p className="text-sm text-gray-600 dark:text-gray-400">
                                                            📦 {product.category} • 🏭 {product.supplier}
                                                        </p>
                                                        {product.description && (
                                                            <p className="text-sm text-gray-500 mt-2">{product.description}</p>
                                                        )}
                                                        <div className="mt-2 inline-block px-3 py-1 bg-orange-500 text-white text-xs font-bold rounded-full">
                                                            ⚠️ Stock Bajo - Reabastecer
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                                                    <div className={`p-4 rounded-xl ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg`}>
                                                        <p className="text-xs text-gray-500 mb-1">Stock Actual</p>
                                                        <p className="text-3xl font-bold text-orange-600">{product.quantity}</p>
                                                    </div>
                                                    <div className={`p-4 rounded-xl ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg`}>
                                                        <p className="text-xs text-gray-500 mb-1">Stock Mínimo</p>
                                                        <p className="text-3xl font-bold text-blue-500">{product.minStock}</p>
                                                    </div>
                                                    <div className={`p-4 rounded-xl ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg`}>
                                                        <p className="text-xs text-gray-500 mb-1">Precio Unit.</p>
                                                        <p className="text-3xl font-bold text-green-500">${product.price}</p>
                                                    </div>
                                                    <div className={`p-4 rounded-xl ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg`}>
                                                        <p className="text-xs text-gray-500 mb-1">Déficit</p>
                                                        <p className="text-3xl font-bold text-red-500">{product.minStock - product.quantity}</p>
                                                    </div>
                                                </div>

                                                <div className="mt-4">
                                                    <div className="flex justify-between text-xs text-gray-500 mb-2">
                                                        <span className="font-semibold">Nivel de Stock</span>
                                                        <span className="font-bold text-orange-500">
                                                            {((product.quantity / product.minStock) * 100).toFixed(0)}% del mínimo
                                                        </span>
                                                    </div>
                                                    <div className={`w-full h-4 ${darkMode ? 'bg-gray-700' : 'bg-gray-200'} rounded-full overflow-hidden shadow-inner`}>
                                                        <div 
                                                            className="h-full progress-bar bg-gradient-to-r from-orange-500 to-orange-600"
                                                            style={{ width: `${Math.min((product.quantity / product.minStock) * 100, 100)}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex md:flex-col gap-3">
                                                <button
                                                    onClick={() => {
                                                        setActiveTab('productos');
                                                        handleEdit(product);
                                                    }}
                                                    className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all duration-300 hover:scale-105 shadow-lg whitespace-nowrap font-semibold"
                                                >
                                                    <Edit2 size={18} />
                                                    <span>Actualizar</span>
                                                </button>
                                                <button
                                                    onClick={() => restockProduct(product.id)}
                                                    className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-3 rounded-xl hover:from-green-600 hover:to-green-700 transition-all duration-300 hover:scale-105 shadow-lg whitespace-nowrap font-semibold"
                                                >
                                                    <RotateCcw size={18} />
                                                    <span>Agregar Stock</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );

    // Resto del componente principal
    return (
        <div className={`min-h-screen ${theme} transition-all duration-500`}>
            {/* Notification */}
            {notification && (
                <div className={`fixed top-4 right-4 z-50 px-6 py-4 rounded-xl shadow-2xl transform transition-all duration-300 ${
                    notification.type === 'success' 
                        ? 'bg-gradient-to-r from-green-500 to-emerald-600' 
                        : notification.type === 'error'
                        ? 'bg-gradient-to-r from-red-500 to-rose-600'
                        : 'bg-gradient-to-r from-blue-500 to-cyan-600'
                } text-white flex items-center gap-3 animate-slide-in`}>
                    <div className="flex-1 font-medium">{notification.message}</div>
                    <button onClick={() => setNotification(null)} className="hover:bg-white/20 p-1 rounded">
                        <X size={20} />
                    </button>
                </div>
            )}

            {/* Header */}
            <header className={`${navBg} backdrop-blur-xl shadow-2xl sticky top-0 z-40 border-b`}>
                <div className="max-w-7xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="relative">
                                <Package size={40} className="text-white" />
                                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-ping"></div>
                                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full"></div>
                            </div>
                            <div>
                                <h1 className="text-2xl md:text-3xl font-bold text-white">
                                    {user ? 'Inventario Pro' : 'Sistema de Caja'}
                                </h1>
                                <p className="text-xs text-blue-200">
                                    {user ? 'Modo Administrador' : 'Modo Caja - Solo Ventas'}
                                </p>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-2 md:gap-3">
                            {/* Botón Modo Oscuro/Claro */}
                            <button
                                onClick={() => {
                                    const newDarkMode = !darkMode;
                                    setDarkMode(newDarkMode);
                                    // Guardar preferencia manual del usuario
                                    localStorage.setItem('darkMode', newDarkMode.toString());
                                    showNotification(`Modo ${newDarkMode ? 'oscuro 🌙' : 'claro ☀️'} activado`);
                                }}
                                className="flex items-center gap-2 bg-gradient-to-r from-purple-500 to-indigo-600 text-white px-4 py-2 rounded-xl hover:from-purple-600 hover:to-indigo-700 transition-all duration-300 hover:scale-105 shadow-lg"
                                title={`Modo ${darkMode ? 'oscuro' : 'claro'} - Click para cambiar`}
                            >
                                {darkMode ? <Sun size={18} /> : <Moon size={18} />}
                                <span className="hidden sm:inline">{darkMode ? 'Claro' : 'Oscuro'}</span>
                            </button>

                            {user ? (
                                <>
                                    <div className="flex items-center gap-2 text-white">
                                        <User size={20} />
                                        <span className="hidden sm:inline">{user.email}</span>
                                    </div>
                                    <button
                                        onClick={handleLogout}
                                        className="flex items-center gap-2 bg-gradient-to-r from-red-500 to-rose-600 text-white px-4 py-2 rounded-xl hover:from-red-600 hover:to-rose-700 transition-all duration-300 hover:scale-105 shadow-lg"
                                    >
                                        <LogOut size={18} />
                                        <span className="hidden sm:inline">Salir</span>
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={() => setShowLoginModal(true)}
                                    className="flex items-center gap-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white px-4 py-2 rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all duration-300 hover:scale-105 shadow-lg"
                                >
                                    <LogIn size={18} />
                                    <span className="hidden sm:inline">Admin</span>
                                </button>
                            )}
                            
                            <button
                                onClick={() => setShowSaleModal(true)}
                                className="flex items-center gap-2 bg-gradient-to-r from-orange-500 to-amber-600 text-white px-4 py-2 rounded-xl hover:from-orange-600 hover:to-amber-700 transition-all duration-300 hover:scale-105 shadow-lg"
                            >
                                <ShoppingCart size={18} />
                                <span>Vender ({currentSale.length})</span>
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Navigation Tabs - Diferentes según el modo */}
            <div className={`${darkMode ? 'bg-gray-800/50' : 'bg-blue-600/10'} backdrop-blur-xl sticky top-[73px] z-30 border-b ${darkMode ? 'border-gray-700' : 'border-blue-200'}`}>
                <div className="max-w-7xl mx-auto px-4">
                    <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                        {/* Tabs para Modo Caja */}
                        {!user && [
                            { id: 'caja', label: '🏪 Caja', icon: '🏪' },
                            { id: 'productos', label: '📦 Productos', icon: '📦' },
                            { id: 'ventas', label: '🧾 Ventas', icon: '🧾' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 md:px-6 py-3 font-medium capitalize transition-all duration-300 whitespace-nowrap relative ${
                                    activeTab === tab.id
                                        ? 'text-blue-500 scale-105 bg-white dark:bg-gray-800 rounded-t-xl'
                                        : `${darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-blue-600 hover:text-blue-800'} hover:scale-105`
                                }`}
                            >
                                <span className="text-lg">{tab.icon}</span>
                                <span>{tab.label}</span>
                                {activeTab === tab.id && (
                                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-t-full"></div>
                                )}
                            </button>
                        ))}

                        {/* Tabs para Modo Admin */}
                        {user && [
                            { id: 'dashboard', label: '📊 Dashboard', icon: '📊' },
                            { id: 'productos', label: '📦 Productos', icon: '📦' },
                            { id: 'ventas', label: '🧾 Ventas', icon: '🧾' },
                            { id: 'alertas', label: '⚠️ Alertas', icon: '⚠️' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 md:px-6 py-3 font-medium capitalize transition-all duration-300 whitespace-nowrap relative ${
                                    activeTab === tab.id
                                        ? 'text-blue-500 scale-105 bg-white dark:bg-gray-800 rounded-t-xl'
                                        : `${darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-blue-600 hover:text-blue-800'} hover:scale-105`
                                }`}
                            >
                                <span className="text-lg">{tab.icon}</span>
                                <span>{tab.label}</span>
                                {tab.id === 'alertas' && stats.criticalAlerts > 0 && (
                                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full animate-pulse">
                                        {stats.criticalAlerts}
                                    </span>
                                )}
                                {activeTab === tab.id && (
                                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-t-full"></div>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Contenido Principal */}
            <div className="max-w-7xl mx-auto px-4 py-8">
                {/* MODO CAJA - Pantalla de Caja */}
                {!user && activeTab === 'caja' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className={`${cardBg} rounded-2xl p-8 shadow-2xl border-2 border-green-500 text-center`}>
                            <div className="flex items-center justify-center gap-4 mb-6">
                                <Store size={48} className="text-green-500" />
                                <h2 className="text-4xl font-bold text-green-600">MODO CAJA ACTIVADO</h2>
                            </div>
                            <p className="text-xl text-gray-600 mb-8">
                                Sistema listo para ventas. Puedes vender productos y generar facturas.
                            </p>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                                <div className={`p-6 rounded-xl ${darkMode ? 'bg-gray-700' : 'bg-green-50'} border border-green-200`}>
                                    <ShoppingCart size={32} className="text-green-500 mx-auto mb-3" />
                                    <h3 className="font-bold text-lg mb-2">Vender Productos</h3>
                                    <p className="text-sm text-gray-600">Agrega productos al carrito y genera facturas</p>
                                </div>
                                <div className={`p-6 rounded-xl ${darkMode ? 'bg-gray-700' : 'bg-blue-50'} border border-blue-200`}>
                                    <Search size={32} className="text-blue-500 mx-auto mb-3" />
                                    <h3 className="font-bold text-lg mb-2">Buscar Productos</h3>
                                    <p className="text-sm text-gray-600">Encuentra productos por nombre rápidamente</p>
                                </div>
                                <div className={`p-6 rounded-xl ${darkMode ? 'bg-gray-700' : 'bg-purple-50'} border border-purple-200`}>
                                    <FileText size={32} className="text-purple-500 mx-auto mb-3" />
                                    <h3 className="font-bold text-lg mb-2">Generar Facturas</h3>
                                    <p className="text-sm text-gray-600">Crea e imprime facturas profesionales</p>
                                </div>
                            </div>

                            <button
                                onClick={() => setShowSaleModal(true)}
                                className="bg-gradient-to-r from-green-500 to-emerald-600 text-white px-8 py-4 rounded-xl shadow-lg font-bold text-xl hover:from-green-600 hover:to-emerald-700 transition-all duration-300"
                            >
                                <ShoppingCart className="inline mr-3" size={24} />
                                INICIAR VENTA
                            </button>
                        </div>

                        {/* Búsqueda rápida en modo caja */}
                        <div className={`${cardBg} rounded-2xl p-6 shadow-xl border ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                            <div className="flex flex-col lg:flex-row gap-4">
                                <div className="relative flex-1">
                                    <Search size={20} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="🔍 Buscar producto por nombre..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className={`${inputBg} w-full pl-12 pr-4 py-4 rounded-xl border-2 text-lg font-medium`}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Productos para vender */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredProducts.filter(p => p.quantity > 0).slice(0, 9).map(product => (
                                <div 
                                    key={product.id} 
                                    className={`${cardBg} rounded-2xl p-6 shadow-xl border-2 border-green-200 hover-lift card-shine`}
                                >
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex-1">
                                            <h3 className="font-bold text-xl mb-2 line-clamp-2">{product.name}</h3>
                                            <span className={`inline-block px-3 py-1 text-xs rounded-full font-medium ${
                                                darkMode ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-800'
                                            }`}>
                                                {product.category}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="space-y-3 mb-4">
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-gray-500 font-medium">📦 Stock:</span>
                                            <span className={`font-bold ${
                                                product.quantity === 0 ? 'text-red-500' :
                                                product.quantity <= product.minStock ? 'text-orange-500' : 'text-green-500'
                                            }`}>
                                                {product.quantity} uds
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-gray-500 font-medium">💰 Precio:</span>
                                            <span className="font-bold text-green-500 text-xl">${product.price.toFixed(2)}</span>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => addToSale(product)}
                                        className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white py-3 rounded-xl font-bold text-lg hover:from-green-600 hover:to-emerald-700 transition-all duration-300 flex items-center justify-center gap-3"
                                    >
                                        <ShoppingCart size={20} />
                                        Agregar a Venta
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Secciones comunes para ambos modos */}
                {/* Productos Tab */}
                {(activeTab === 'productos' || (user && activeTab === 'productos')) && (
                    <div className="space-y-6 animate-fade-in">
                        {/* Controls - Diferentes según el modo */}
                        <div className={`${cardBg} rounded-2xl p-6 shadow-xl border ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                            <div className="flex flex-col lg:flex-row gap-4">
                                <div className="relative flex-1">
                                    <Search size={20} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="🔍 Buscar por nombre, proveedor o descripción..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className={`${inputBg} w-full pl-12 pr-4 py-3 rounded-xl border transition-all duration-300 font-medium`}
                                    />
                                </div>
                                
                                <div className="flex gap-3">
                                    <select
                                        value={filterCategory}
                                        onChange={(e) => setFilterCategory(e.target.value)}
                                        className={`${inputBg} px-4 py-3 rounded-xl border transition-all duration-300 font-medium`}
                                    >
                                        <option value="all">📦 Todas las categorías</option>
                                        {categories.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>

                                    {/* Solo admin puede agregar productos */}
                                    {user && (
                                        <button
                                            onClick={() => {
                                                setShowForm(!showForm);
                                                setEditingProduct(null);
                                                setFormData({ name: '', category: 'Electrónica', quantity: '', price: '', minStock: '', supplier: '', description: '' });
                                            }}
                                            className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-xl shadow-lg whitespace-nowrap font-medium hover:from-blue-600 hover:to-blue-700 transition-all duration-300"
                                        >
                                            <Plus size={20} />
                                            <span className="hidden sm:inline">Nuevo Producto</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
                                <span className="font-medium">
                                    📊 Mostrando <span className="text-blue-500 font-bold">{filteredProducts.length}</span> de <span className="font-bold">{products.length}</span> productos
                                </span>
                                {!user && (
                                    <span className="text-orange-500 font-medium">
                                        🔒 Modo Caja - Solo lectura
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Formulario de producto (solo admin) */}
                        {user && showForm && (
                            <ProductForm />
                        )}

                        {/* Grid de productos */}
                        {products.length === 0 ? (
                            <div className={`${cardBg} rounded-2xl p-12 shadow-xl border ${darkMode ? 'border-gray-700' : 'border-gray-200'} text-center`}>
                                <div className="w-32 h-32 mx-auto mb-6 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                                    <Package size={64} className="text-white" />
                                </div>
                                <h3 className="text-3xl font-bold mb-4">¡No hay productos!</h3>
                                <p className="text-gray-500 mb-8 text-lg max-w-2xl mx-auto">
                                    {user 
                                        ? 'Tu inventario está vacío. Comienza agregando tus primeros productos.'
                                        : 'No hay productos disponibles para venta.'
                                    }
                                </p>
                                {user && (
                                    <button
                                        onClick={() => setShowForm(true)}
                                        className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-8 py-4 rounded-xl shadow-lg font-semibold text-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-300 flex items-center justify-center gap-3"
                                    >
                                        <Plus size={24} />
                                        Agregar Primer Producto
                                    </button>
                                )}
                            </div>
                        ) : filteredProducts.length === 0 ? (
                            <div className={`${cardBg} rounded-2xl p-12 shadow-xl border ${darkMode ? 'border-gray-700' : 'border-gray-200'} text-center`}>
                                <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                                    <Search size={48} className="text-gray-400" />
                                </div>
                                <h3 className="text-2xl font-bold mb-2">No se encontraron productos</h3>
                                <p className="text-gray-500 mb-6">Intenta ajustar los filtros de búsqueda</p>
                                <button
                                    onClick={() => {
                                        setSearchTerm('');
                                        setFilterCategory('all');
                                    }}
                                    className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-xl shadow-lg font-medium hover:from-blue-600 hover:to-blue-700 transition-all duration-300"
                                >
                                    Limpiar Filtros
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {filteredProducts.map(product => (
                                    <ProductCard key={product.id} product={product} />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Ventas Tab (común para ambos modos) */}
                {/* Ventas Tab (común para ambos modos) */}
{(activeTab === 'ventas' || (user && activeTab === 'ventas')) && (
    <div className="space-y-6 animate-fade-in">
        <div className={`${cardBg} rounded-2xl p-6 shadow-xl border ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>

            <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-green-500/20 rounded-xl">
                    <ShoppingCart size={32} className="text-green-500" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold">🧾 Historial de Ventas</h2>
                    <p className="text-sm text-gray-500">
                        {user ? 'Registro completo de ventas' : 'Tus ventas recientes'}
                    </p>
                </div>
            </div>

            {/* 🔍 BUSCADOR DE VENTAS */}
            <div className="mb-6">
                <div className="relative">
                    <Search size={20} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="🔍 Buscar venta por ID, producto o fecha..."
                        value={searchSaleTerm}
                        onChange={(e) => setSearchSaleTerm(e.target.value)}
                        className={`${inputBg} w-full pl-12 pr-4 py-3 rounded-xl border transition-all duration-300 font-medium`}
                    />
                </div>
            </div>

            {sales.length === 0 ? (
                <div className="text-center py-16 animate-bounce-in">
                    <div className="inline-block p-8 bg-gray-500/20 rounded-full mb-6">
                        <ShoppingCart size={64} className="text-gray-500" />
                    </div>
                    <h3 className="text-3xl font-bold text-gray-500 mb-3">📦 No hay ventas registradas</h3>
                    <p className="text-gray-500 mb-6 text-lg">Las ventas aparecerán aquí</p>
                    <button
                        onClick={() => setShowSaleModal(true)}
                        className="bg-gradient-to-r from-green-500 to-emerald-600 text-white px-8 py-4 rounded-xl shadow-lg font-semibold text-lg hover:from-green-600 hover:to-emerald-700 transition-all duration-300"
                    >
                        <ShoppingCart className="inline mr-2" size={24} />
                        Realizar Primera Venta
                    </button>
                </div>
            ) : (
                <div className="space-y-4">

                    {/* 🔢 ESTADÍSTICAS DE VENTAS */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                        <div className={`p-4 rounded-xl ${darkMode ? 'bg-gray-700' : 'bg-gray-100'} text-center`}>
                            <p className="text-sm text-gray-500 mb-1">Total Ventas</p>
                            <p className="text-2xl font-bold text-green-500">${stats.totalSales.toLocaleString()}</p>
                        </div>
                        <div className={`p-4 rounded-xl ${darkMode ? 'bg-gray-700' : 'bg-gray-100'} text-center`}>
                            <p className="text-sm text-gray-500 mb-1">Unidades Vendidas</p>
                            <p className="text-2xl font-bold text-blue-500">{stats.totalUnitsSold}</p>
                        </div>
                        <div className={`p-4 rounded-xl ${darkMode ? 'bg-gray-700' : 'bg-gray-100'} text-center`}>
                            <p className="text-sm text-gray-500 mb-1">Venta Promedio</p>
                            <p className="text-2xl font-bold text-purple-500">${stats.avgSale.toFixed(2)}</p>
                        </div>
                        <div className={`p-4 rounded-xl ${darkMode ? 'bg-gray-700' : 'bg-gray-100'} text-center`}>
                            <p className="text-sm text-gray-500 mb-1">Total de Ventas</p>
                            <p className="text-2xl font-bold text-orange-500">{sales.length}</p>
                        </div>
                    </div>

                    {/* 🔍 FILTRADO DE VENTAS */}
                    {sales
                        .filter(sale =>
                            sale.productName.toLowerCase().includes(searchSaleTerm.toLowerCase()) ||
                            sale.saleId?.toLowerCase().includes(searchSaleTerm.toLowerCase()) ||
                            new Date(sale.date).toLocaleDateString('es-ES').includes(searchSaleTerm)
                        )
                        .slice().reverse()
                        .map(sale => (
                            <div
                                key={sale.id}
                                className={`border-l-4 border-green-500 ${darkMode ? 'bg-green-900/20' : 'bg-green-50'} p-4 rounded-xl hover-lift`}
                            >
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="p-2 bg-green-500/20 rounded-lg">
                                                <CheckCircle size={20} className="text-green-500" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-lg">{sale.productName}</h3>
                                                <p className="text-sm text-gray-500">
                                                    ID: {sale.saleId} •{" "}
                                                    {new Date(sale.date).toLocaleDateString('es-ES')} •{" "}
                                                    {new Date(sale.date).toLocaleTimeString('es-ES')}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="text-right">
                                        <p className="text-2xl font-bold text-green-500">${sale.total.toLocaleString()}</p>
                                        <p className="text-sm text-gray-500">{sale.quantity} uds × ${sale.price}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                </div>
            )}
        </div>
    </div>
)}

                {/* Secciones solo para admin */}
                {user && activeTab === 'dashboard' && (
                    <AdminDashboard />
                )}

                {user && activeTab === 'alertas' && (
                    <AdminAlerts />
                )}
            </div>

            {/* Modal de Login */}
            {showLoginModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className={`${cardBg} rounded-2xl p-8 w-full max-w-md`}>
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-bold">🔐 Acceso Administrador</h2>
                            <button onClick={() => setShowLoginModal(false)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg">
                                <X size={24} />
                            </button>
                        </div>
                        
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-2">Email</label>
                                <input
                                    type="email"
                                    value={loginData.email}
                                    onChange={(e) => setLoginData({...loginData, email: e.target.value})}
                                    className={`${inputBg} w-full px-4 py-3 rounded-xl border transition-all duration-300`}
                                    placeholder="admin@tienda.com"
                                    required
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium mb-2">Contraseña</label>
                                <input
                                    type="password"
                                    value={loginData.password}
                                    onChange={(e) => setLoginData({...loginData, password: e.target.value})}
                                    className={`${inputBg} w-full px-4 py-3 rounded-xl border transition-all duration-300`}
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                            
                            <div className="flex gap-3">
                                <button
                                    type="submit"
                                    className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white py-3 rounded-xl shadow-lg font-semibold hover:from-blue-600 hover:to-blue-700 transition-all duration-300"
                                >
                                    <LogIn className="inline mr-2" size={20} />
                                    Iniciar Sesión
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowLoginModal(false)}
                                    className="px-6 bg-gray-500 text-white py-3 rounded-xl font-semibold hover:bg-gray-600 transition-all duration-300"
                                >
                                    Cerrar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de Venta (común para ambos modos) */}
            {showSaleModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className={`${cardBg} rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto`}>
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-bold">🛒 Procesar Venta</h2>
                            <button onClick={() => setShowSaleModal(false)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Lista de productos */}
                            <div>
                                <h3 className="text-lg font-semibold mb-4">Productos Disponibles</h3>
                                <div className="space-y-2 max-h-96 overflow-y-auto">
                                    {products.filter(p => p.quantity > 0).map(product => (
                                        <div key={product.id} className={`p-3 rounded-lg border ${darkMode ? 'border-gray-700' : 'border-gray-200'} flex justify-between items-center`}>
                                            <div>
                                                <p className="font-medium">{product.name}</p>
                                                <p className="text-sm text-gray-500">
                                                    Stock: {product.quantity} • ${product.price}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => addToSale(product)}
                                                className="bg-blue-500 text-white px-3 py-1 rounded-lg hover:bg-blue-600 transition-colors"
                                            >
                                                Agregar
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Carrito de venta */}
                            <div>
                                <h3 className="text-lg font-semibold mb-4">Carrito de Venta</h3>
                                {currentSale.length === 0 ? (
                                    <p className="text-gray-500 text-center py-8">No hay productos en el carrito</p>
                                ) : (
                                    <div className="space-y-3">
                                        {currentSale.map(item => (
                                            <div key={item.id} className={`p-3 rounded-lg border ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                                                <div className="flex justify-between items-start mb-2">
                                                    <div>
                                                        <p className="font-medium">{item.name}</p>
                                                        <p className="text-sm text-gray-500">${item.price} c/u</p>
                                                    </div>
                                                    <button
                                                        onClick={() => removeFromSale(item.id)}
                                                        className="text-red-500 hover:text-red-700"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => updateSaleQuantity(item.id, item.quantity - 1)}
                                                        className="w-6 h-6 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center"
                                                    >
                                                        -
                                                    </button>
                                                    <span className="font-medium">{item.quantity}</span>
                                                    <button
                                                        onClick={() => updateSaleQuantity(item.id, item.quantity + 1)}
                                                        className="w-6 h-6 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center"
                                                    >
                                                        +
                                                    </button>
                                                    <span className="ml-auto font-bold">${item.total.toFixed(2)}</span>
                                                </div>
                                            </div>
                                        ))}
                                        
                                        <div className="border-t pt-3">
                                            <div className="flex justify-between items-center text-lg font-bold">
                                                <span>Total:</span>
                                                <span>${saleTotal.toFixed(2)}</span>
                                            </div>
                                        </div>
                                        
                                        <div className="flex gap-3">
                                            <button
                                                onClick={processSale}
                                                className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white py-3 rounded-xl font-semibold hover:from-green-600 hover:to-emerald-700 transition-all duration-300"
                                            >
                                                Procesar Venta y Generar Factura
                                            </button>
                                            <button
                                                onClick={() => setShowSaleModal(false)}
                                                className="px-6 bg-gray-500 text-white py-3 rounded-xl font-semibold hover:bg-gray-600 transition-all duration-300"
                                            >
                                                Cerrar
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Footer */}
            <footer className={`${darkMode ? 'bg-gray-800/95' : 'bg-white/95'} backdrop-blur-xl border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'} mt-12`}>
                <div className="max-w-7xl mx-auto px-4 py-8">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                            <Package size={32} className="text-blue-500" />
                            <div>
                                <p className="font-bold text-lg">
                                    {user ? 'Inventario Pro' : 'Sistema de Caja'}
                                </p>
                                <p className="text-xs text-gray-500">
                                    {user ? 'Modo Administrador' : 'Modo Caja - Solo Ventas'}
                                </p>
                            </div>
                        </div>
                        <div className="text-center md:text-right">
                            <p className="text-sm text-gray-500 mb-1">© 2025 Sistema Profesional</p>
                            <p className="text-xs text-gray-400">Conectado a Firebase</p>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};

// Renderizar la aplicación
ReactDOM.render(React.createElement(InventoryManagementSystem), document.getElementById('root'));