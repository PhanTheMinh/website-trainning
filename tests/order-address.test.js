const { finalAddressSchema } = require('../src/validators/orders.validator')
const address = { first_name: 'Test', last_name: 'Buyer', email: 'buyer@example.com', phone: '0901234567',
    country_code: 'VN', province_state: 'Hải Dương', city: 'Kinh Môn', zip_code: '03431' }
test('accepts the simplified checkout address without street/unit/house/ward', () => {
    const result = finalAddressSchema.validate(address)
    expect(result.error).toBeUndefined()
    expect(result.value).toMatchObject({ street: '', house_number: '', apartment: '', ward: '', zip_code: '03431' })
})
test('still requires contact details and city', () => {
    for (const field of ['first_name', 'last_name', 'email', 'phone', 'city']) {
        expect(finalAddressSchema.validate({ ...address, [field]: '' }).error).toBeDefined()
    }
})
test('preserves older address details when supplied for existing drafts', () => {
    const result = finalAddressSchema.validate({ ...address, street: 'Old street', house_number: '12', apartment: 'A1', ward: 'Ward 1' })
    expect(result.error).toBeUndefined()
    expect(result.value.street).toBe('Old street')
})
